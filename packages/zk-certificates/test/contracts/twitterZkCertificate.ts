/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { BigNumber } from 'ethers';
import hre, { ethers } from 'hardhat';
import { groth16 } from 'snarkjs';

import {
  fromDecToHex,
  fromHexToBytes32,
  processProof,
  processPublicSignals,
} from '../../lib/helpers';
import type {ZkCertificate } from '../../lib/zkCertificate';
import {
  generateSampleTwitterZkCertificate,
  generateTwitterZkCertificateProofInput,
} from '../../scripts/generateTwitterZkCertificateInput';
import type { MockZkCertificateRegistry } from '../../typechain-types/contracts/mock/MockZkCertificateRegistry';
import type { TwitterZkCertificate } from '../../typechain-types/contracts/TwitterZkCertificate';
import type { TwitterZkCertificateVerifier } from '../../typechain-types/contracts/zkpVerifiers/TwitterZkCertificateVerifier';

chai.config.includeStack = true;

const { expect } = chai;

describe('zkCertificate SC', () => {
  // reset the testing chain so we can perform time related tests
  /* await hre.network.provider.send('hardhat_reset'); */
  let twitterZkCertificateContract: TwitterZkCertificate;
  let twitterZkCertificateVerifier: TwitterZkCertificateVerifier;
  let mockZkCertificateRegistry: MockZkCertificateRegistry;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let twitterZkCertificate: ZkCertificate;
  let sampleInput: any, circuitWasmPath: string, circuitZkeyPath: string;

  beforeEach(async () => {
    // reset the testing chain so we can perform time related tests
    await hre.network.provider.send('hardhat_reset');

    [deployer, user, randomUser] = await hre.ethers.getSigners();

    // set up KYCRegistry, GalacticaInstitution, ZkKYCVerifier, ZkKYC
    const mockZkCertificateRegistryFactory = await ethers.getContractFactory(
      'MockZkCertificateRegistry',
      deployer,
    );
    mockZkCertificateRegistry =
      (await mockZkCertificateRegistryFactory.deploy()) as MockZkCertificateRegistry;


    const twitterZkCertificateVerifierFactory = await ethers.getContractFactory(
      'TwitterZkCertificateVerifier',
      deployer,
    );
    twitterZkCertificateVerifier = (await twitterZkCertificateVerifierFactory.deploy()) as TwitterZkCertificateVerifier;

    const twitterZkCertificateFactory = await ethers.getContractFactory('TwitterZkCertificate', deployer);
    twitterZkCertificateContract = (await twitterZkCertificateFactory.deploy(
      deployer.address,
      twitterZkCertificateVerifier.address,
      mockZkCertificateRegistry.address,
      [],
    )) as TwitterZkCertificate;

    twitterZkCertificate = await generateSampleTwitterZkCertificate();
    sampleInput = await generateTwitterZkCertificateProofInput(
      twitterZkCertificate
    );

    // get signer object authorized to use the zkKYC record
    user = await hre.ethers.getImpersonatedSigner(sampleInput.userAddress);

    circuitWasmPath = './circuits/build/twitterZkCertificate.wasm';
    circuitZkeyPath = './circuits/build/twitterZkCertificate.zkey';
  });

  it('only owner can change KYCRegistry and Verifier addresses', async () => {
    // random user cannot change the addresses
    await expect(
      zkKYCContract.connect(user).setVerifier(user.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(
      zkKYCContract.connect(user).setKYCRegistry(user.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');

    // owner can change addresses
    await zkKYCContract.connect(deployer).setVerifier(user.address);
    await zkKYCContract.connect(deployer).setKYCRegistry(user.address);

    expect(await zkKYCContract.verifier()).to.be.equal(user.address);
    expect(await zkKYCContract.KYCRegistry()).to.be.equal(user.address);
  });

  it.only('correct proof can be verified onchain', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await twitterZkCertificateContract.INDEX_ROOT()];
    const publicTime = parseInt(
      publicSignals[await twitterZkCertificateContract.INDEX_CURRENT_TIME()],
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
    console.log(`sample inputs are`);
    console.log(sampleInput);
    console.log(`public inputs are`);
    console.log(publicInputs);
    await twitterZkCertificateContract.connect(user).verifyProof(piA, piB, piC, publicInputs);
  });

  it('incorrect proof failed to be verified', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await zkKYCContract.INDEX_ROOT()];
    // set the merkle root to the correct one
    await mockKYCRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );
    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);

    // switch c, a to get an incorrect proof
    await expect(
      zkKYCContract.connect(user).verifyProof(piC, piB, piA, publicInputs),
    ).to.be.reverted;
  });

  it('revert if proof output is invalid', async () => {
    const forgedInput = { ...sampleInput };
    // make the zkKYC record expire leading to invalid proof output
    forgedInput.currentTime = Number(forgedInput.expirationDate) + 1;

    const { proof, publicSignals } = await groth16.fullProve(
      forgedInput,
      circuitWasmPath,
      circuitZkeyPath,
    );
    expect(publicSignals[await zkKYCContract.INDEX_IS_VALID()]).to.be.equal(
      '0',
    );
    const publicRoot = publicSignals[await zkKYCContract.INDEX_ROOT()];
    // set the merkle root to the correct one

    await mockKYCRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );
    // set time to the public time
    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);
    await expect(
      zkKYCContract.connect(user).verifyProof(piA, piB, piC, publicInputs),
    ).to.be.revertedWith('the proof output is not valid');
  });

  it('revert if public output merkle root does not match with the one onchain', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    // we don't set the merkle root to the correct one

    // set time to the public time
    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);
    await expect(
      zkKYCContract.connect(user).verifyProof(piA, piB, piC, publicInputs),
    ).to.be.revertedWith("the root in the proof doesn't match");
  });

  it('revert if time is too far from current time', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await zkKYCContract.INDEX_ROOT()];
    const publicTime = parseInt(
      publicSignals[await zkKYCContract.INDEX_CURRENT_TIME()],
      10,
    );
    // set the merkle root to the correct one

    await mockKYCRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );
    // set time to the public time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      publicTime + 200 + 30 * 60,
    ]);

    await hre.network.provider.send('evm_mine');
    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);
    await expect(
      zkKYCContract.connect(user).verifyProof(piA, piB, piC, publicInputs),
    ).to.be.revertedWith('the current time is incorrect');
  });

  it('unauthorized user cannot use the proof', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await zkKYCContract.INDEX_ROOT()];
    const publicTime = parseInt(
      publicSignals[await zkKYCContract.INDEX_CURRENT_TIME()],
      10,
    );
    // set the merkle root to the correct one
    await mockKYCRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );
    // set time to the public time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [publicTime]);
    await hre.network.provider.send('evm_mine');

    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);
    await expect(
      zkKYCContract
        .connect(randomUser)
        .verifyProof(piA, piB, piC, publicInputs),
    ).to.be.revertedWith(
      'transaction submitter is not authorized to use this proof',
    );
  });

  it('should work with investigation institutions and shamir secret sharing', async () => {
    // for fraud investigation, we have different circuit parameters and therefore different input and verifier
    zkKYC = await generateSampleZkKYC();
    const inputWithInstitutions = await generateZkKYCProofInput(
      zkKYC,
      amountInstitutions,
      zkKYCContract.address,
    );

    const zkKYCVerifierFactory = await ethers.getContractFactory(
      'InvestigatableZkKYCVerifier',
      deployer,
    );
    const verifierSC = (await zkKYCVerifierFactory.deploy()) as ZkKYCVerifier;

    const zkKYCFactory = await ethers.getContractFactory('ZkKYC', deployer);
    const investigatableZkKYC = await zkKYCFactory.deploy(
      deployer.address,
      verifierSC.address,
      mockKYCRegistry.address,
      mockGalacticaInstitutions.map((inst) => inst.address),
    );

    const { proof, publicSignals } = await groth16.fullProve(
      inputWithInstitutions,
      './circuits/build/investigatableZkKYC.wasm',
      './circuits/build/investigatableZkKYC.zkey',
    );

    // set the institution pub keys
    const startIndexInvestigatable: number =
      await investigatableZkKYC.START_INDEX_INVESTIGATION_INSTITUTIONS();
    for (let i = 0; i < amountInstitutions; i++) {
      const galacticaInstitutionPubKey: [BigNumber, BigNumber] = [
        publicSignals[startIndexInvestigatable + 2 * i],
        publicSignals[startIndexInvestigatable + 2 * i + 1],
      ];
      await mockGalacticaInstitutions[i].setInstitutionPubkey(
        galacticaInstitutionPubKey,
      );
    }

    const publicRoot = publicSignals[await investigatableZkKYC.INDEX_ROOT()];
    const publicTime = parseInt(
      publicSignals[await investigatableZkKYC.INDEX_CURRENT_TIME()],
      10,
    );
    // set the merkle root to the correct one
    await mockKYCRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );

    // set time to the public time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [publicTime]);
    await hre.network.provider.send('evm_mine');

    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);
    await investigatableZkKYC
      .connect(user)
      .verifyProof(piA, piB, piC, publicInputs);

    // also check that it correctly reverts if an institution key is wrong
    // set different institution pub key
    const startIndexBasic: number =
      await zkKYCContract.START_INDEX_INVESTIGATION_INSTITUTIONS();
    const galacticaInstitutionPubKey: [BigNumber, BigNumber] = [
      BigNumber.from(publicSignals[startIndexBasic]).add('1'),
      publicSignals[startIndexBasic + 1],
    ];
    await mockGalacticaInstitutions[2].setInstitutionPubkey(
      galacticaInstitutionPubKey,
    );
    await expect(
      investigatableZkKYC
        .connect(user)
        .verifyProof(piA, piB, piC, publicInputs),
    ).to.be.revertedWith('the first part of institution pubkey is incorrect');
  });
});
