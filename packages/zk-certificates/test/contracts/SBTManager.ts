/* eslint-disable require-atomic-updates */
/* eslint-disable jest/no-if */
/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import { time } from '@nomicfoundation/hardhat-network-helpers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import hre, { ethers } from 'hardhat';
import { groth16 } from 'snarkjs';

import twitterExample from '../../example/twitterFields.json';
import {
  fromDecToHex,
  fromHexToBytes32,
  processProof,
  processPublicSignals,
} from '../../lib/helpers';
import type { ZkCertificate } from '../../lib/zkCertificate';
import {
  generateSampleTwitterZkCertificate,
  generateTwitterZkCertificateProofInput,
} from '../../scripts/generateTwitterZkCertificateInput';
import type { MockZkCertificateRegistry } from '../../typechain-types/contracts/mock/MockZkCertificateRegistry';
import type { SBTManager } from '../../typechain-types/contracts/SBT_related/SBTManager';
import type { VerificationSBT } from '../../typechain-types/contracts/SBT_related/VerificationSBT';
import type { TwitterFollowersCountProof } from '../../typechain-types/contracts/TwitterFollowersCountProof';
import type { TwitterCreationTimeProof } from '../../typechain-types/contracts/verifierWrappers/TwitterCreationTimeProof';
import type { TwitterCreationTimeProofVerifier } from '../../typechain-types/contracts/zkpVerifiers/TwitterCreationTimeProofVerifier';
import type { TwitterFollowersCountProofVerifier } from '../../typechain-types/contracts/zkpVerifiers/TwitterFollowersCountProofVerifier';

chai.config.includeStack = true;

const { expect } = chai;

describe('SBTManager', () => {
  // reset the testing chain so we can perform time related tests
  /* await hre.network.provider.send('hardhat_reset'); */
  let SBTManager: SBTManager;
  let twitterFollowersCountProof: TwitterFollowersCountProof;
  let twitterFollowersCountProofVerifier: TwitterFollowersCountProofVerifier;
  let twitterCreationTimeProof: TwitterCreationTimeProof;
  let twitterCreationTimeProofVerifier: TwitterCreationTimeProofVerifier;
  let mockZkCertificateRegistry: MockZkCertificateRegistry;
  let SBTs: VerificationSBT[];

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let twitterZkCertificates: ZkCertificate[];
  let sampleInputs: any[];
  let circuitWasmPath1: string;
  let circuitZkeyPath1: string;
  let circuitWasmPath2: string;
  let circuitZkeyPath2: string;

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

    const twitterFollowersCountProofVerifierFactory =
      await ethers.getContractFactory(
        'TwitterFollowersCountProofVerifier',
        deployer,
      );
    twitterFollowersCountProofVerifier =
      (await twitterFollowersCountProofVerifierFactory.deploy()) as TwitterFollowersCountProofVerifier;

    const twitterFollowersCountProofFactory = await ethers.getContractFactory(
      'TwitterFollowersCountProof',
      deployer,
    );
    twitterFollowersCountProof =
      (await twitterFollowersCountProofFactory.deploy(
        deployer.address,
        twitterFollowersCountProofVerifier.address,
        mockZkCertificateRegistry.address,
        [],
      )) as TwitterFollowersCountProof;

    const twitterCreationTimeProofVerifierFactory =
      await ethers.getContractFactory(
        'TwitterCreationTimeProofVerifier',
        deployer,
      );
    twitterCreationTimeProofVerifier =
      (await twitterCreationTimeProofVerifierFactory.deploy()) as TwitterCreationTimeProofVerifier;

    const twitterCreationTimeProofFactory = await ethers.getContractFactory(
      'TwitterCreationTimeProof',
      deployer,
    );
    twitterCreationTimeProof = (await twitterCreationTimeProofFactory.deploy(
      deployer.address,
      twitterCreationTimeProofVerifier.address,
      mockZkCertificateRegistry.address,
      [],
    )) as TwitterCreationTimeProof;

    // set up airdropGateway and set up the client
    const SBTManagerFactory = await ethers.getContractFactory(
      'SBTManager',
      deployer,
    );

    SBTManager = (await SBTManagerFactory.deploy(
      deployer.address,
    )) as SBTManager;

    twitterZkCertificates = [];
    const twitterExample1 = twitterExample;
    twitterExample1.followersCount = 110;
    twitterZkCertificates.push(
      await generateSampleTwitterZkCertificate(twitterExample1),
    );

    const twitterExample2 = twitterExample;
    twitterExample2.followersCount = 1100;
    twitterZkCertificates.push(
      await generateSampleTwitterZkCertificate(twitterExample2),
    );

    const twitterExample3 = twitterExample;
    twitterExample3.followersCount = 11000;
    twitterZkCertificates.push(
      await generateSampleTwitterZkCertificate(twitterExample3),
    );

    const twitterExample4 = twitterExample;
    twitterExample4.createdAt = '2018-06-19T17:24:53Z'; // before 2020-01-01
    twitterZkCertificates.push(
      await generateSampleTwitterZkCertificate(twitterExample4),
    );

    const twitterExample5 = twitterExample;
    twitterExample5.createdAt = '2024-06-19T17:24:53Z'; // after 2024-01-01
    twitterZkCertificates.push(
      await generateSampleTwitterZkCertificate(twitterExample5),
    );

    sampleInputs = [];
    sampleInputs.push(
      await generateTwitterZkCertificateProofInput(twitterZkCertificates[0]),
    );
    sampleInputs[0].followersCountThreshold = 100;

    sampleInputs.push(
      await generateTwitterZkCertificateProofInput(twitterZkCertificates[1]),
    );
    sampleInputs[1].followersCountThreshold = 1000;

    sampleInputs.push(
      await generateTwitterZkCertificateProofInput(twitterZkCertificates[2]),
    );
    sampleInputs[2].followersCountThreshold = 10000;

    sampleInputs.push(
      await generateTwitterZkCertificateProofInput(twitterZkCertificates[3]),
    );
    sampleInputs[3].creationTimeLowerBound = 0;
    sampleInputs[3].creationTimeUpperBound = 1577836800;

    sampleInputs.push(
      await generateTwitterZkCertificateProofInput(twitterZkCertificates[4]),
    );
    sampleInputs[4].creationTimeLowerBound = 1704067200;
    sampleInputs[4].creationTimeUpperBound = 1735689600;

    circuitWasmPath1 = './circuits/build/twitterFollowersCountProof.wasm';
    circuitZkeyPath1 = './circuits/build/twitterFollowersCountProof.zkey';

    circuitWasmPath2 = './circuits/build/twitterCreationTimeProof.wasm';
    circuitZkeyPath2 = './circuits/build/twitterCreationTimeProof.zkey';

    // deploying the SBTs
    SBTs = [];
    const VerificationSBTFactory = await ethers.getContractFactory(
      'VerificationSBT',
      deployer,
    );
    for (let i = 0; i < 5; i++) {
      SBTs.push(
        (await VerificationSBTFactory.deploy(
          `test_${i}`,
          `test_${i}`,
          `test_${i}`,
          SBTManager.address,
        )) as VerificationSBT,
      );
    }

    // set up the verifier wrappers and SBTs addresses in the SBTManager contract
    for (let i = 0; i < 5; i++) {
      await SBTManager.setSBT(i, SBTs[i].address);
      if (i < 3) {
        await SBTManager.setVerifierWrapper(
          i,
          twitterFollowersCountProof.address,
        );
      } else {
        await SBTManager.setVerifierWrapper(
          i,
          twitterCreationTimeProof.address,
        );
      }
    }
  });
  it('only owner can assign SBTs and verifier wrappers', async () => {
    // random user cannot whitelist
    await expect(
      SBTManager.connect(randomUser).setSBT(0, SBTs[0].address),
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await expect(
      SBTManager.connect(randomUser).setVerifierWrapper(0, SBTs[0].address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('check that user can only receive the SBT after fulfilling the condition', async () => {
    for (let i = 0; i < 5; i++) {
      let circuitWasmPath, circuitZkeyPath;
      if (i < 3) {
        circuitWasmPath = circuitWasmPath1;
        circuitZkeyPath = circuitZkeyPath1;
      } else {
        circuitWasmPath = circuitWasmPath2;
        circuitZkeyPath = circuitZkeyPath2;
      }
      const { proof, publicSignals } = await groth16.fullProve(
        sampleInputs[i],
        circuitWasmPath,
        circuitZkeyPath,
      );

      const [piA, piB, piC] = processProof(proof);

      const publicInputs = processPublicSignals(publicSignals);
      let publicRoot, publicTime;
      if (i < 3) {
        publicRoot =
          publicSignals[await twitterFollowersCountProof.INDEX_ROOT()];
        publicTime = parseInt(
          publicSignals[await twitterFollowersCountProof.INDEX_CURRENT_TIME()],
          10,
        );
      } else {
        publicRoot = publicSignals[await twitterCreationTimeProof.INDEX_ROOT()];
        publicTime = parseInt(
          publicSignals[await twitterCreationTimeProof.INDEX_CURRENT_TIME()],
          10,
        );
      }

      // set the merkle root to the correct one
      await mockZkCertificateRegistry.setMerkleRoot(
        fromHexToBytes32(fromDecToHex(publicRoot)),
      );

      // set time to the public time
      const currentBlockTime = await time.latest();
      await hre.network.provider.send('evm_setNextBlockTimestamp', [
        Math.max(publicTime, currentBlockTime) + 1,
      ]);
      await hre.network.provider.send('evm_mine');

      // get signer object authorized to use the zkCertificate record
      user = await hre.ethers.getImpersonatedSigner(
        sampleInputs[i].userAddress,
      );

      expect(await SBTs[i].balanceOf(user.address)).to.be.equal(0);
      await SBTManager.connect(user).mintSBT(i, piA, piB, piC, publicInputs);
      expect(await SBTs[i].balanceOf(user.address)).to.be.equal(1);

      // check that the first user cannot mint the third SBT because he doesn't have enough followers
      if (i === 0) {
        await expect(
          SBTManager.connect(user).mintSBT(2, piA, piB, piC, publicInputs),
        ).to.be.revertedWith('Followers count threshold is not set correctly');

        // it wouldn't even work even when the user forcefully change the follower count threshold
        publicInputs[7] = 10000;
        await expect(
          SBTManager.connect(user).mintSBT(2, piA, piB, piC, publicInputs),
        ).to.be.revertedWith('the proof is incorrect');
      }
      // check that the fourth user cannot mint the fifth SBT because his twitter creation time is not in 2024
      if (i === 3) {
        await expect(
          SBTManager.connect(user).mintSBT(4, piA, piB, piC, publicInputs),
        ).to.be.revertedWith('Creation time lower bound is not set correctly');
        // it wouldn't even work even when the user forcefully change the follower count threshold
        publicInputs[7] = 1704067200;
        publicInputs[8] = 1735689600;
        await expect(
          SBTManager.connect(user).mintSBT(4, piA, piB, piC, publicInputs),
        ).to.be.revertedWith('the proof is incorrect');
      }
    }
  });
});
