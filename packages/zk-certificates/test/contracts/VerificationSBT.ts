/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import chai, { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { buildEddsa } from 'circomlibjs';
import type { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { groth16 } from 'snarkjs';

import {
  fromDecToHex,
  fromHexToBytes32,
  processProof,
  processPublicSignals,
} from '../../lib/helpers';
import { getEddsaKeyFromEthSigner } from '../../lib/keyManagement';
import { queryVerificationSBTs } from '../../lib/queryVerificationSBT';
import { decryptFraudInvestigationData } from '../../lib/SBTData';
import { reconstructShamirSecret } from '../../lib/shamirTools';
import type { ZkCertificate } from '../../lib/zkCertificate';
import {
  generateSampleZkKYC,
  generateZkKYCProofInput,
} from '../../scripts/generateZkKYCInput';
import type { AgeProofZkKYC } from '../../typechain-types/contracts/AgeProofZkKYC';
import type { MockDApp } from '../../typechain-types/contracts/mock/MockDApp';
import type { MockGalacticaInstitution } from '../../typechain-types/contracts/mock/MockGalacticaInstitution';
import type { MockZkCertificateRegistry } from '../../typechain-types/contracts/mock/MockZkCertificateRegistry';
import type { VerificationSBT } from '../../typechain-types/contracts/VerificationSBT';
import type { ExampleMockDAppVerifier } from '../../typechain-types/contracts/zkpVerifiers/ExampleMockDAppVerifier';

use(chaiAsPromised);

chai.config.includeStack = true;

describe('Verification SBT Smart contract', () => {
  let ageProofZkKYC: AgeProofZkKYC;
  let exampleMockDAppVerifier: ExampleMockDAppVerifier;
  let mockZkCertificateRegistry: MockZkCertificateRegistry;
  let mockGalacticaInstitutions: MockGalacticaInstitution[];
  const amountInstitutions = 3;
  let mockDApp: MockDApp;
  let verificationSBT: VerificationSBT;
  let token1, token2;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let encryptionAccount: SignerWithAddress;
  const institutions: SignerWithAddress[] = [];
  let zkKYC: ZkCertificate;
  let sampleInput: any;
  let circuitWasmPath: string;
  let circuitZkeyPath: string;

  beforeEach(async () => {
    // reset the testing chain so we can perform time related tests
    await hre.network.provider.send('hardhat_reset');

    [deployer, user, encryptionAccount] = await hre.ethers.getSigners();
    for (let i = 0; i < amountInstitutions; i++) {
      institutions.push((await ethers.getSigners())[4 + i]);
    }

    // set up KYCRegistry, ZkKYCVerifier, ZkKYC
    const mockZkCertificateRegistryFactory = await ethers.getContractFactory(
      'MockZkCertificateRegistry',
      deployer,
    );
    mockZkCertificateRegistry =
      (await mockZkCertificateRegistryFactory.deploy()) as MockZkCertificateRegistry;

    const mockGalacticaInstitutionFactory = await ethers.getContractFactory(
      'MockGalacticaInstitution',
      deployer,
    );
    mockGalacticaInstitutions = [];
    for (let i = 0; i < amountInstitutions; i++) {
      mockGalacticaInstitutions.push(
        (await mockGalacticaInstitutionFactory.deploy()) as MockGalacticaInstitution,
      );
    }

    const exampleMockDAppVerifierFactory = await ethers.getContractFactory(
      'ExampleMockDAppVerifier',
      deployer,
    );
    exampleMockDAppVerifier =
      (await exampleMockDAppVerifierFactory.deploy()) as ExampleMockDAppVerifier;

    const ageProofZkKYCFactory = await ethers.getContractFactory(
      'AgeProofZkKYC',
      deployer,
    );
    ageProofZkKYC = (await ageProofZkKYCFactory.deploy(
      await deployer.getAddress(),
      await exampleMockDAppVerifier.getAddress(),
      await mockZkCertificateRegistry.getAddress(),
      mockGalacticaInstitutions.map(async (inst) => await inst.getAddress()),
    )) as AgeProofZkKYC;

    const verificationSBTFactory = await ethers.getContractFactory(
      'VerificationSBT',
      deployer,
    );
    verificationSBT = (await verificationSBTFactory.deploy(
      'test URI',
    )) as VerificationSBT;

    const mockDAppFactory = await ethers.getContractFactory(
      'MockDApp',
      deployer,
    );
    mockDApp = (await mockDAppFactory.deploy(
      await verificationSBT.getAddress(),
      await ageProofZkKYC.getAddress(),
    )) as MockDApp;

    const mockTokenFactory = await ethers.getContractFactory(
      'MockToken',
      deployer,
    );

    token1 = await mockTokenFactory.deploy(await mockDApp.getAddress());
    token2 = await mockTokenFactory.deploy(await mockDApp.getAddress());

    await mockDApp.setToken1(await token1.getAddress());
    await mockDApp.setToken2(await token2.getAddress());

    // inputs to create proof
    zkKYC = await generateSampleZkKYC();
    sampleInput = await generateZkKYCProofInput(
      zkKYC,
      amountInstitutions,
      await mockDApp.getAddress(),
    );
    const today = new Date(Date.now());
    sampleInput.currentYear = today.getUTCFullYear();
    sampleInput.currentMonth = today.getUTCMonth() + 1;
    sampleInput.currentDay = today.getUTCDate();
    sampleInput.ageThreshold = 18;

    // advance time a bit to set it later in the test
    sampleInput.currentTime += 100;

    // get signer object authorized to use the zkKYC record
    user = await hre.ethers.getImpersonatedSigner(sampleInput.userAddress);

    // get signer object authorized to use the zkKYC record
    user = await hre.ethers.getImpersonatedSigner(sampleInput.userAddress);

    circuitWasmPath = './circuits/build/exampleMockDApp.wasm';
    circuitZkeyPath = './circuits/build/exampleMockDApp.zkey';
  });

  it('if the proof is correct the verification SBT is minted', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await ageProofZkKYC.INDEX_ROOT()];

    // set the merkle root to the correct one
    await mockZkCertificateRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );

    const publicTime = parseInt(
      publicSignals[await ageProofZkKYC.INDEX_CURRENT_TIME()],
      10,
    );

    // set the galactica institution pub key
    // set the institution pub keys
    const startIndex: number =
      await ageProofZkKYC.START_INDEX_INVESTIGATION_INSTITUTIONS();
    for (let i = 0; i < amountInstitutions; i++) {
      const galacticaInstitutionPubKey: [BigNumber, BigNumber] = [
        publicSignals[startIndex + 2 * i],
        publicSignals[startIndex + 2 * i + 1],
      ];
      await mockGalacticaInstitutions[i].setInstitutionPubkey(
        galacticaInstitutionPubKey,
      );
    }

    // set time to the public time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [publicTime]);
    await hre.network.provider.send('evm_mine');

    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);
    const humanID = publicInputs[await ageProofZkKYC.INDEX_HUMAN_ID()];

    const currentTokenId = await verificationSBT.tokenCounter();
    const previousUserBalance = await verificationSBT.balanceOf(await user.getAddress());

    // test that the transfer event is emitted
    await expect(
      mockDApp.connect(user).airdropToken(1, piA, piB, piC, publicInputs),
    )
      .to.emit(verificationSBT, 'Transfer')
      .withArgs(
        '0x0000000000000000000000000000000000000000',
        await user.getAddress(),
        currentTokenId,
      );

    // test that the token counter has been increased
    expect(await verificationSBT.tokenCounter()).to.be.equal(
      currentTokenId.add(1),
    );
    expect(await verificationSBT.balanceOf(await user.getAddress())).to.be.equal(
      previousUserBalance.add(1),
    );
    expect(await verificationSBT.tokenIdToOwner(currentTokenId)).to.be.equal(
      await user.getAddress(),
    );
    expect(await verificationSBT.tokenIdToDApp(currentTokenId)).to.be.equal(
      await mockDApp.getAddress(),
    );

    // check that the verification SBT is created
    expect(
      await verificationSBT.isVerificationSBTValid(
        await user.getAddress(),
        await mockDApp.getAddress(),
      ),
    ).to.be.equal(true);
    // data is stored for the correct humanID
    expect(
      await mockDApp.hasReceivedToken1(fromHexToBytes32(fromDecToHex(humanID))),
    ).to.be.equal(true);

    // check the content of the verification SBT
    const verificationSBTInfo = await verificationSBT.getVerificationSBTInfo(
      await user.getAddress(),
      await mockDApp.getAddress(),
    );
    expect(verificationSBTInfo.dApp).to.be.equal(await mockDApp.getAddress());
    expect(verificationSBTInfo.verifierWrapper).to.be.equal(
      await ageProofZkKYC.getAddress(),
    );

    // check that the verificationSBT can be used to receive the second token without proof
    await mockDApp.connect(user).airdropToken(
      2,
      [0, 0],
      [
        [0, 0],
        [0, 0],
      ],
      [0, 0],
      publicInputs,
    );

    expect(
      await mockDApp.hasReceivedToken2(fromHexToBytes32(fromDecToHex(humanID))),
    ).to.be.true;

    // test decryption
    const userPriv = await getEddsaKeyFromEthSigner(encryptionAccount);

    const eddsa = await buildEddsa();
    const userPub = eddsa.prv2pub(userPriv);

    // let all institutions decrypt their shamir secret sharing part
    const decryptedData: any[][] = [];
    for (let i = 0; i < amountInstitutions; i++) {
      const galaInstitutionPriv = await getEddsaKeyFromEthSigner(
        institutions[i],
      );

      decryptedData[i] = await decryptFraudInvestigationData(
        galaInstitutionPriv,
        userPub,
        [
          verificationSBTInfo.encryptedData[2 * i],
          verificationSBTInfo.encryptedData[2 * i + 1],
        ],
      );
    }

    // test if the first two investigation institutions can decrypt the data (2 of 3 shamir secret sharing)
    const reconstructedSecret = reconstructShamirSecret(eddsa.F, 2, [
      [1, decryptedData[0][0]],
      [2, decryptedData[1][0]],
    ]);
    expect(
      reconstructedSecret,
      'Fraud investigation should be able to reconstruct the secret',
    ).to.be.equal(zkKYC.leafHash);

    // check that the verification SBT can be found by the frontend
    const loggedSBTs = await queryVerificationSBTs(
      await verificationSBT.getAddress(),
      await user.getAddress(),
    );
    expect(loggedSBTs.has(await mockDApp.getAddress())).to.be.true;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(loggedSBTs.get(await mockDApp.getAddress())!.length).to.be.equal(1);
  });

  it('should revert on incorrect proof', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    // change the proof to make it incorrect
    proof.pi_a[0] = `${JSON.stringify(proof.pi_a[0])}1`;

    const publicRoot = publicSignals[await ageProofZkKYC.INDEX_ROOT()];
    const publicTime = parseInt(
      publicSignals[await ageProofZkKYC.INDEX_CURRENT_TIME()],
      10,
    );
    // set the merkle root to the correct one
    await mockZkCertificateRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );

    // set time to the public time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [publicTime]);
    await hre.network.provider.send('evm_mine');

    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);

    const tx = mockDApp
      .connect(user)
      .airdropToken(1, piA, piB, piC, publicInputs);

    await expect(tx).to.be.rejected;
  });
});
