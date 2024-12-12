/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import hre from 'hardhat';

import { deployTwitterProofs } from './deploymentSteps/twitterProofs';

/**
 * Script to deploy the example DApp, a smart contract requiring zkKYC + age proof to airdrop tokens once to each user.
 */
async function main() {
  // parameters
  const zkTwitterRecordRegistry = '0xe262d4e095BAb2F6e32ED46C5bBec5Fe73f1a0eA';
  const creationTimeBefore2020SBT = {
    uri: 'ipfs://QmNQCnW9QTnveNHr9aNsGWsHz3HBkCZ7x2XzQ2wehAiyAh',
    name: 'X created before 2020',
    symbol: 'XOG',
  };
  const creationTimeIn2024SBT = {
    uri: 'ipfs://QmWtncmCSLKJBmmpntrQbeMFpUyUJEPsASacQfaVCQJobr',
    name: 'X created in 2024',
    symbol: 'X2024',
  };
  const followersCount100SBT = {
    uri: 'ipfs://Qmd8rVPsgdDa7ySCSnBbCYFFc6mGPzpX39rfLguWy8FQjQ',
    name: 'X 100 followers',
    symbol: 'X100F',
  };
  const followersCount1kSBT = {
    uri: 'ipfs://QmTt81xC3z9ZaYBV35rQAr3QkMNQD3wA5GaKE2JGf3FFxc',
    name: 'X 1k followers',
    symbol: 'X1K',
  };
  const followersCount10kSBT = {
    uri: 'ipfs://QmVALCT5SmMwxbSVdc28RwtnTuTPSr6srUftQCRbJiPUxZ',
    name: 'X 10k followers',
    symbol: 'X10K',
  };

  // wallets
  const [deployer] = await hre.ethers.getSigners();

  await deployTwitterProofs(
    deployer,
    zkTwitterRecordRegistry,
    creationTimeBefore2020SBT,
    creationTimeIn2024SBT,
    followersCount100SBT,
    followersCount1kSBT,
    followersCount10kSBT,
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
