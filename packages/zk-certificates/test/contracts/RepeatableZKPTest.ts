/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import hre, { ethers } from 'hardhat';
import { groth16 } from 'snarkjs';

import {
  fromDecToHex,
  fromHexToBytes32,
  processProof,
  processPublicSignals,
} from '../../lib/helpers';
import type { ZKCertificate } from '../../lib/zkCertificate';
import {
  generateSampleZkKYC,
  generateZkKYCProofInput,
} from '../../scripts/generateZKKYCInput';
import type { MockKYCRegistry } from '../../typechain-types/contracts/mock/MockKYCRegistry';
import type { RepeatableZKPTest } from '../../typechain-types/contracts/mock/RepeatableZKPTest';
import type { VerificationSBT } from '../../typechain-types/contracts/VerificationSBT';
import type { ZkKYC } from '../../typechain-types/contracts/ZkKYC';
import type { ZkKYCVerifier } from '../../typechain-types/contracts/ZkKYCVerifier';

chai.config.includeStack = true;
const { expect } = chai;

describe('RepeatableZKPTest', () => {
  // reset the testing chain so we can perform time related tests
  /* await hre.network.provider.send('hardhat_reset'); */
  let zkKycSC: ZkKYC;
  let zkKYCVerifier: ZkKYCVerifier;
  let mockKYCRegistry: MockKYCRegistry;
  let verificationSBT: VerificationSBT;
  let repeatableZKPTest: RepeatableZKPTest;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let zkKYC: ZKCertificate;
  let sampleInput: any, circuitWasmPath: string, circuitZkeyPath: string;

  beforeEach(async () => {
    // TODO: use fixture instead
    // reset the testing chain so we can perform time related tests
    await hre.network.provider.send('hardhat_reset');

    [deployer, user] = await hre.ethers.getSigners();

    // set up KYCRegistry, ZkKYCVerifier, ZkKYC
    const mockKYCRegistryFactory = await ethers.getContractFactory(
      'MockKYCRegistry',
      deployer,
    );
    mockKYCRegistry =
      (await mockKYCRegistryFactory.deploy()) as MockKYCRegistry;

    const zkKYCVerifierFactory = await ethers.getContractFactory(
      'ZkKYCVerifier',
      deployer,
    );

    zkKYCVerifier = (await zkKYCVerifierFactory.deploy()) as ZkKYCVerifier;

    const zkKYCFactory = await ethers.getContractFactory('ZkKYC', deployer);
    zkKycSC = (await zkKYCFactory.deploy(
      deployer.address,
      zkKYCVerifier.address,
      mockKYCRegistry.address,
      [],
    )) as ZkKYC;
    await zkKYCVerifier.deployed();

    const verificationSBTFactory = await ethers.getContractFactory(
      'VerificationSBT',
      deployer,
    );
    verificationSBT =
      (await verificationSBTFactory.deploy()) as VerificationSBT;

    const repeatableZKPTestFactory = await ethers.getContractFactory(
      'RepeatableZKPTest',
      deployer,
    );
    repeatableZKPTest = (await repeatableZKPTestFactory.deploy(
      verificationSBT.address,
      zkKycSC.address,
    )) as RepeatableZKPTest;

    // inputs to create proof
    zkKYC = await generateSampleZkKYC();
    sampleInput = await generateZkKYCProofInput(
      zkKYC,
      0,
      repeatableZKPTest.address,
    );
    sampleInput.dAppAddress = repeatableZKPTest.address;

    // advance time a bit to set it later in the test
    sampleInput.currentTime += 100;

    // get signer object authorized to use the zkKYC record
    user = await hre.ethers.getImpersonatedSigner(sampleInput.userAddress);

    circuitWasmPath = './circuits/build/zkKYC.wasm';
    circuitZkeyPath = './circuits/build/zkKYC.zkey';
  });

  it('should issue VerificationSBT on correct proof and accept ZKP multiple times', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await zkKycSC.INDEX_ROOT()];
    const publicTime = parseInt(
      publicSignals[await zkKycSC.INDEX_CURRENT_TIME()],
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
    await repeatableZKPTest
      .connect(user)
      .submitZKP(piA, piB, piC, publicInputs);

    expect(
      await verificationSBT.isVerificationSBTValid(
        user.address,
        repeatableZKPTest.address,
      ),
    ).to.be.true;

    await repeatableZKPTest
      .connect(user)
      .submitZKP(piA, piB, piC, publicInputs);
  });

  it('should catch incorrect proof', async () => {
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const publicRoot = publicSignals[await zkKycSC.INDEX_ROOT()];
    // set the merkle root to the correct one

    await mockKYCRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );
    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);

    // switch c, a to get an incorrect proof
    // it doesn't fail on time because the time change remains from the previous test
    await expect(
      repeatableZKPTest.connect(user).submitZKP(piC, piB, piA, publicInputs),
    ).to.be.reverted;
  });
});
