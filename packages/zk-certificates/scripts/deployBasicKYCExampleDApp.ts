/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import hre from 'hardhat';

import { deployBasicKYCExampleDApp } from './deploymentSteps/basicKYCExampleDApp';

/**
 * Script to deploy the example DApp, a smart contract requiring zkKYC to issue a verification SBT.
 */
async function main() {
  // parameters
  const zkKYC = '0xfDa5904dC71a244Ab88D86CE015365c17FEbe3CE'; // you can reuse the zkKYC smart contract from the deployment of the RepeatableZKPTest
  const verificationSBT = {
    uri: 'ipfs://QmdYZJP26w8dXHvR9g5Bykw4Ziqvgrst6p9XesZeR1qa2R',
    name: 'KYC Verification SBT',
    symbol: 'KYCOK',
  };

  // wallets
  const [deployer] = await hre.ethers.getSigners();

  // deploying everything
  await deployBasicKYCExampleDApp(deployer, zkKYC, verificationSBT);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
