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
import type { ZkCertificate } from '../../lib/zkCertificate';
import {
  generateSampleZkKYC,
  generateZkKYCProofInput,
} from '../../scripts/generateZkKYCInput';
import type { AirdropGateway } from '../../typechain-types/contracts/AirdropGateway';
import type { GalacticaOfficialSBT } from '../../typechain-types/contracts/GalacticaOfficialSBT';
import type { MockGalacticaInstitution } from '../../typechain-types/contracts/mock/MockGalacticaInstitution';
import type { MockToken } from '../../typechain-types/contracts/mock/MockToken';
import type { MockZkCertificateRegistry } from '../../typechain-types/contracts/mock/MockZkCertificateRegistry';
import type { ZkKYC } from '../../typechain-types/contracts/ZkKYC';
import type { ZkKYCVerifier } from '../../typechain-types/contracts/zkpVerifiers/ZkKYCVerifier';

chai.config.includeStack = true;

const { expect } = chai;

describe('AirdropGateway', () => {
  // reset the testing chain so we can perform time related tests
  /* await hre.network.provider.send('hardhat_reset'); */
  let faucet: Faucet;
  let rewardToken: MockToken;
  let zkKYCContract: ZkKYC;
  let mockZkKYC: ZkKYCVerifier;
  let mockZkCertificateRegistry: MockZkCertificateRegistry;
  let mockGalacticaInstitutions: MockGalacticaInstitution[];
  let GalaSBT: GalacticaOfficialSBT;
  let GalaSBT2: GalacticaOfficialSBT;
  const amountInstitutions = 3;
  let epochDuration: number;
  let epochStartTime: number;
  let amountPerEpoch: number;

  let deployer: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let randomUser: SignerWithAddress;
  let zkKYC: ZkCertificate;
  let client: SignerWithAddress;
  let clientRole: string;
  let defaultAdminRole: string;
  let sampleInput: any, circuitWasmPath: string, circuitZkeyPath: string;
  let sampleInput2: any;

  beforeEach(async () => {
    // reset the testing chain so we can perform time related tests
    await hre.network.provider.send('hardhat_reset');

    [deployer, user, user2, randomUser, client] = await hre.ethers.getSigners();

    // set up KYCRegistry, GalacticaInstitution, ZkKYCVerifier, ZkKYC
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
    
    // interaction with zkKYC has been tested in AirdropGateway and BasicKYCExampleDAppTest
    const MockZkKYCFactory = await hre.ethers.getContractFactory('MockZkKYC');
    const mockZkKYC = await MockZkKYCFactory.deploy();
    await mockZkKYC.deployed();

    // set up VerificationSBT
    const verificationSBTFactory = await ethers.getContractFactory(
      'VerificationSBT',
      deployer,
    );
    verificationSBT = (await verificationSBTFactory.deploy(
      'test URI',
      'VerificationSBT',
      'VerificationSBT',
    )) as VerificationSBT;

    // set up the faucet
    epochDuration = 100;
    epochStartTime = 1000;
    amountPerEpoch = 100;

    const faucetFactory = await ethers.getContractFactory(
      'Faucet',
      deployer,
    );
    faucet = (await faucetFactory.deploy(
      deployer.address,
      epochDuration,
      epochStartTime,
      amountPerEpoch,
      mockZkKYC.address,
      verificationSBT.address,  
    )) as Faucet;
  });

  it('only owner can whitelist or dewhitelist clients', async () => {
    // random user cannot whitelist
    await expect(
      airdropGateway.connect(randomUser).whitelistClient(client.address),
    ).to.be.revertedWith(
      `AccessControl: account ${randomUser.address.toLowerCase()} is missing role ${defaultAdminRole}`,
    );

    expect(
      await airdropGateway.hasRole(clientRole, client.address),
    ).to.be.equal(false);

    // owner can whitelist
    await airdropGateway.connect(deployer).whitelistClient(client.address);
    expect(
      await airdropGateway.hasRole(clientRole, client.address),
    ).to.be.equal(true);

    // owner can dewhitelist
    await airdropGateway.connect(deployer).dewhitelistClient(client.address);
    expect(
      await airdropGateway.hasRole(clientRole, client.address),
    ).to.be.equal(false);
  });

  it('only clients can set up new distributions', async () => {
    // distribution parameters
    const requiredSBTs = [GalaSBT.address, GalaSBT2.address];
    // we test some error cases first
    const registrationStartTime = 100;
    let registrationEndTime = 50;
    let claimStartTime = 20;
    let claimEndTime = 10;

    // client hasn't been whitelisted yet
    await expect(
      airdropGateway
        .connect(client)
        .setDistribution(
          requiredSBTs,
          rewardToken.address,
          registrationStartTime,
          registrationEndTime,
          claimStartTime,
          claimEndTime,
        ),
    ).to.be.revertedWith(
      `AccessControl: account ${client.address.toLowerCase()} is missing role ${clientRole}`,
    );

    // whitelist client
    await airdropGateway.connect(deployer).whitelistClient(client.address);

    // invalid registration time
    await expect(
      airdropGateway
        .connect(client)
        .setDistribution(
          requiredSBTs,
          rewardToken.address,
          registrationStartTime,
          registrationEndTime,
          claimStartTime,
          claimEndTime,
        ),
    ).to.be.revertedWith(`invalid registration time`);

    registrationEndTime = registrationStartTime + 10;

    // invalid claim start time
    await expect(
      airdropGateway
        .connect(client)
        .setDistribution(
          requiredSBTs,
          rewardToken.address,
          registrationStartTime,
          registrationEndTime,
          claimStartTime,
          claimEndTime,
        ),
    ).to.be.revertedWith(`claim can only start after registration ends`);

    claimStartTime = registrationEndTime + 10;

    // invalid claim time
    await expect(
      airdropGateway
        .connect(client)
        .setDistribution(
          requiredSBTs,
          rewardToken.address,
          registrationStartTime,
          registrationEndTime,
          claimStartTime,
          claimEndTime,
        ),
    ).to.be.revertedWith(`invalid claim time`);

    claimEndTime = claimStartTime + 10;
    // set distribution and check event emission
    await expect(
      airdropGateway
        .connect(client)
        .setDistribution(
          requiredSBTs,
          rewardToken.address,
          registrationStartTime,
          registrationEndTime,
          claimStartTime,
          claimEndTime,
        ),
    )
      .to.emit(airdropGateway, 'DistributionCreated')
      .withArgs(client.address);

    // check that the distribution parameters are set correctly
    const onchainDistribution = await airdropGateway.currentDistribution();
    const onchainRequiredSBTs = await airdropGateway.getRequiredSBTs();

    expect(onchainRequiredSBTs[0]).to.be.equal(requiredSBTs[0]);
    expect(onchainRequiredSBTs[1]).to.be.equal(requiredSBTs[1]);
    expect(onchainDistribution.registrationStartTime).to.be.equal(
      registrationStartTime,
    );
    expect(onchainDistribution.registrationEndTime).to.be.equal(
      registrationEndTime,
    );
    expect(onchainDistribution.claimStartTime).to.be.equal(claimStartTime);
    expect(onchainDistribution.claimEndTime).to.be.equal(claimEndTime);
    expect(onchainDistribution.clientAddress).to.be.equal(client.address);
    expect(onchainDistribution.tokenAddress).to.be.equal(rewardToken.address);
    expect(onchainDistribution.distributionAmount).to.be.equal(0);
    expect(onchainDistribution.registeredUserCount).to.be.equal(0);
    expect(onchainDistribution.tokenAmountPerUser).to.be.equal(0);
    expect(onchainDistribution.amountClaimed).to.be.equal(0);
  });

  it('eligible users can register and claim airdrop', async () => {
    // retrieve the block time
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);

    const publicRoot = publicSignals[await zkKYCContract.INDEX_ROOT()];

    // set the merkle root to the correct one
    await mockZkCertificateRegistry.setMerkleRoot(
      fromHexToBytes32(fromDecToHex(publicRoot)),
    );

    const publicTime = parseInt(
      publicSignals[await zkKYCContract.INDEX_CURRENT_TIME()],
      10,
    );

    // distribution parameters
    const requiredSBTs = [GalaSBT.address, GalaSBT2.address];
    const registrationStartTime = publicTime + 10;
    const registrationEndTime = registrationStartTime + 10000;
    const claimStartTime = registrationEndTime + 10000;
    const claimEndTime = claimStartTime + 10000;

    // set up the distribution
    await airdropGateway.connect(deployer).whitelistClient(client.address);

    await airdropGateway
      .connect(client)
      .setDistribution(
        requiredSBTs,
        rewardToken.address,
        registrationStartTime,
        registrationEndTime,
        claimStartTime,
        claimEndTime,
      );

    // set time to the public time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [publicTime]);
    await hre.network.provider.send('evm_mine');
    await expect(
      airdropGateway.connect(user).register(piA, piB, piC, publicInputs),
    ).to.be.revertedWith(`registration has not started yet`);

    // set time to the registration start time
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      registrationStartTime,
    ]);
    await hre.network.provider.send('evm_mine');

    // user still doesn't have required SBTs
    await expect(
      airdropGateway.connect(user).register(piA, piB, piC, publicInputs),
    ).to.be.revertedWith(`user does not have required SBT`);

    // we mint the first SBT for the user, but it is not enough
    await GalaSBT.connect(deployer).mint(user.address);
    await expect(
      airdropGateway.connect(user).register(piA, piB, piC, publicInputs),
    ).to.be.revertedWith(`user does not have required SBT`);

    // we mint the second SBT for the user, and it is enough
    await GalaSBT2.connect(deployer).mint(user.address);
    await expect(
      airdropGateway.connect(user).register(piA, piB, piC, publicInputs),
    )
      .to.emit(airdropGateway, 'UserRegistered')
      .withArgs(user.address);

    // user cannot register again with the same zkKYC
    // there are some weird issues deconstructing the output
    const outputs = await groth16.fullProve(
      sampleInput2,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const [piA2, piB2, piC2] = processProof(outputs.proof);

    const publicInputs2 = processPublicSignals(outputs.publicSignals);
    await expect(
      airdropGateway
        .connect(randomUser)
        .register(piA2, piB2, piC2, publicInputs2),
    ).to.be.revertedWith(`user has already registered`);

    // we check that parameters are set correctly
    const humanID = publicInputs2[await zkKYCContract.INDEX_HUMAN_ID()];
    expect(await airdropGateway.registeredUsers(user.address)).to.be.equal(
      true,
    );
    expect(await airdropGateway.registeredHumanID(humanID)).to.be.equal(true);
    expect(
      (await airdropGateway.currentDistribution()).registeredUserCount,
    ).to.be.equal(1);
  });

  it('check that the distribution calculation is correct', async () => {
    // set up a zkKYC contract that always return true
    const MockZkKYCFactory = await hre.ethers.getContractFactory('MockZkKYC');
    const mockZkKYC = await MockZkKYCFactory.deploy();
    await mockZkKYC.deployed();

    const airdropGatewayFactory = await ethers.getContractFactory(
      'AirdropGateway',
      deployer,
    );
    airdropGateway = (await airdropGatewayFactory.deploy(
      deployer.address,
      mockZkKYC.address,
    )) as AirdropGateway;

    // distribution parameters
    const requiredSBTs = [GalaSBT.address, GalaSBT2.address];

    sampleInput = await generateZkKYCProofInput(
      zkKYC,
      0,
      airdropGateway.address,
    );

    // retrieve the block time
    const { proof, publicSignals } = await groth16.fullProve(
      sampleInput,
      circuitWasmPath,
      circuitZkeyPath,
    );

    const [piA, piB, piC] = processProof(proof);

    const publicInputs = processPublicSignals(publicSignals);

    const userHumanID = publicInputs[await zkKYCContract.INDEX_HUMAN_ID()];
    // make a different humanID
    let user2HumanID = userHumanID;
    let user3HumanID = userHumanID;

    // we want to make sure that the humanIDs are pairwise different
    if (userHumanID.endsWith('0')) {
      user2HumanID = userHumanID.replace(/.$/u, '1');
      user3HumanID = userHumanID.replace(/.$/u, '2');
    } else if (userHumanID.endsWith('1')) {
      user2HumanID = userHumanID.replace(/.$/u, '0');
      user3HumanID = userHumanID.replace(/.$/u, '2');
    } else {
      user2HumanID = userHumanID.replace(/.$/u, '0');
      user3HumanID = userHumanID.replace(/.$/u, '1');
    }

    const publicInputs2 = publicInputs.slice();
    publicInputs2[await zkKYCContract.INDEX_HUMAN_ID()] = user2HumanID;
    const publicInputs3 = publicInputs.slice();
    publicInputs3[await zkKYCContract.INDEX_HUMAN_ID()] = user3HumanID;

    const publicTime = parseInt(
      publicSignals[await zkKYCContract.INDEX_CURRENT_TIME()],
      10,
    );

    const registrationStartTime = publicTime + 10;
    const registrationEndTime = registrationStartTime + 10000;
    const claimStartTime = registrationEndTime + 10000;
    const claimEndTime = claimStartTime + 10000;

    // set up the distribution
    await airdropGateway.connect(deployer).whitelistClient(client.address);

    await airdropGateway
      .connect(client)
      .setDistribution(
        requiredSBTs,
        rewardToken.address,
        registrationStartTime,
        registrationEndTime,
        claimStartTime,
        claimEndTime,
      );

    // we mint SBTs for both users
    await GalaSBT.connect(deployer).mint(user.address);
    await GalaSBT2.connect(deployer).mint(user.address);
    await GalaSBT.connect(deployer).mint(user2.address);
    await GalaSBT2.connect(deployer).mint(user2.address);
    await GalaSBT.connect(deployer).mint(randomUser.address);
    await GalaSBT2.connect(deployer).mint(randomUser.address);

    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      registrationStartTime,
    ]);
    await hre.network.provider.send('evm_mine');

    await expect(
      airdropGateway.connect(user).register(piA, piB, piC, publicInputs),
    )
      .to.emit(airdropGateway, 'UserRegistered')
      .withArgs(user.address);
    await expect(
      airdropGateway.connect(user2).register(piA, piB, piC, publicInputs2),
    )
      .to.emit(airdropGateway, 'UserRegistered')
      .withArgs(user2.address);
    await expect(
      airdropGateway.connect(randomUser).register(piA, piB, piC, publicInputs3),
    )
      .to.emit(airdropGateway, 'UserRegistered')
      .withArgs(randomUser.address);

    // check that the number of registred users is updated correctly
    expect(
      (await airdropGateway.currentDistribution()).registeredUserCount,
    ).to.be.equal(3);

    // client needs to deposit airdrop token
    const airdropAmount = ethers.utils.parseEther('10');
    await rewardToken
      .connect(deployer)
      .transfer(client.address, airdropAmount.mul(3));
    await rewardToken
      .connect(deployer)
      .approve(airdropGateway.address, airdropAmount);
    await rewardToken
      .connect(client)
      .approve(airdropGateway.address, airdropAmount);
    // check that only client can deposit
    await expect(
      airdropGateway.connect(deployer).deposit(airdropAmount),
    ).to.be.revertedWith(
      `AccessControl: account ${deployer.address.toLowerCase()} is missing role ${clientRole}`,
    );
    await airdropGateway.connect(client).deposit(airdropAmount);
    expect(
      (await airdropGateway.currentDistribution()).distributionAmount,
    ).to.be.equal(airdropAmount);
    expect(await rewardToken.balanceOf(airdropGateway.address)).to.be.equal(
      airdropAmount,
    );

    // we check that users cannot claim ahead of time
    await expect(airdropGateway.connect(user).claim()).to.be.revertedWith(
      `claim has not started yet`,
    );

    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      claimStartTime,
    ]);
    await hre.network.provider.send('evm_mine');

    // check that client cannot deposit anymore
    await rewardToken
      .connect(client)
      .approve(airdropGateway.address, airdropAmount);
    await expect(
      airdropGateway.connect(client).deposit(airdropAmount),
    ).to.be.revertedWith(`claim has already started`);

    // we check that tokenAmountPerUser is initiallly still 0
    expect(
      (await airdropGateway.currentDistribution()).tokenAmountPerUser,
    ).to.be.equal(0);

    // we let users claim
    const expectedTokenAmountPerUser = airdropAmount.div(3);
    await expect(airdropGateway.connect(user).claim())
      .to.emit(airdropGateway, 'UserClaimed')
      .withArgs(user.address, expectedTokenAmountPerUser);
    // we check that the tokenAmountPerUser has been updated after first claim
    expect(
      (await airdropGateway.currentDistribution()).tokenAmountPerUser,
    ).to.be.equal(expectedTokenAmountPerUser);
    // we check other infos as well
    expect(
      (await airdropGateway.currentDistribution()).amountClaimed,
    ).to.be.equal(expectedTokenAmountPerUser);
    // we check that user 1 indeed has his tokens
    expect(await rewardToken.balanceOf(user.address)).to.be.equal(
      expectedTokenAmountPerUser,
    );
    expect(await airdropGateway.claimedUsers(user.address)).to.be.equal(true);

    await expect(airdropGateway.connect(user2).claim())
      .to.emit(airdropGateway, 'UserClaimed')
      .withArgs(user2.address, expectedTokenAmountPerUser);
    expect(
      (await airdropGateway.currentDistribution()).amountClaimed,
    ).to.be.equal(expectedTokenAmountPerUser.mul(2));
    expect(await rewardToken.balanceOf(user2.address)).to.be.equal(
      expectedTokenAmountPerUser,
    );

    // we check that user cannot claim twice
    await expect(airdropGateway.connect(user).claim()).to.be.revertedWith(
      `user has already claimed`,
    );

    // we check that client cannot withdraw after the claim
    await expect(
      airdropGateway.connect(client).withdrawRemainingToken(),
    ).to.be.revertedWith(`claim has not ended yet`);

    // set the claim time to end
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      claimEndTime,
    ]);
    await hre.network.provider.send('evm_mine');

    // user cannot claim anymore
    await expect(airdropGateway.connect(randomUser).claim()).to.be.revertedWith(
      `claim has ended`,
    );
    const balanceBefore = await rewardToken.balanceOf(client.address);
    await airdropGateway.connect(client).withdrawRemainingToken();
    const balanceAfter = await rewardToken.balanceOf(client.address);
    const expectedAmountToWithdraw = (
      await airdropGateway.currentDistribution()
    ).distributionAmount.sub(
      (await airdropGateway.currentDistribution()).amountClaimed,
    );
    expect(balanceAfter.sub(balanceBefore)).to.be.equal(
      expectedAmountToWithdraw,
    );
  });
});
