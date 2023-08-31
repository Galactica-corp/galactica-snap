// SPDX-License-Identifier: BUSL-1.1
import { ZkCertRegistered } from '@galactica-net/snap-api';
import { createHolderCommitment, ZkCertStandard } from '@galactica-net/zkkyc';
import { buildEddsa } from 'circomlibjs';
import { keccak256 } from 'js-sha3';

/**
 * Calculates the holder commitment from the eddsa key. It is used to link a ZkCert to a holder without revealing the holder's identity to the provider.
 *
 * @param holderEddsaKey - The eddsa key of the holder.
 */
export async function calculateHolderCommitment(
  holderEddsaKey: string,
): Promise<string> {
  // use holder commitment function from zkkyc module (calculated on zkCert construction)
  return createHolderCommitment(await buildEddsa(), holderEddsaKey);
}

/**
 * Provides an overview of the zkCert storage. This data can be queried by front-ends.
 * The data shared here must not reveal any private information or possibility to track users).
 *
 * @param zkCertStorage - The list of zkCerts stored.
 * @returns ZkCerts metadata listed for each zkCertStandard.
 */
export function getZkCertStorageOverview(zkCertStorage: ZkCertRegistered[]): any {
  const sharedZkCerts: any = {};
  for (const zkCert of zkCertStorage) {
    if (sharedZkCerts[zkCert.zkCertStandard] === undefined) {
      sharedZkCerts[zkCert.zkCertStandard] = [];
    }

    const disclosureData: any = {
      providerPubKey: {
        ax: zkCert.providerData.ax,
        ay: zkCert.providerData.ay,
      },
    };
    if (zkCert.zkCertStandard === ZkCertStandard.zkKYC) {
      disclosureData.expirationDate = zkCert.content.expirationDate;
      disclosureData.verificationLevel = zkCert.content.verificationLevel;
    }
    sharedZkCerts[zkCert.zkCertStandard].push(disclosureData);
  }
  return sharedZkCerts;
}

/**
 * Provides hashes of zkCerts stored in the snap. Used to detect changes in the storage.
 *
 * @param zkCertStorage - The list of zkCerts stored.
 * @param origin - The site asking for the hash. Used as salt to prevent tracking.
 * @returns Storage hash for each zkCertStandard.
 */
export function getZkCertStorageHashes(
  zkCertStorage: ZkCertRegistered[],
  origin: string,
): any {
  const storageHashes: any = {};
  for (const zkCert of zkCertStorage) {
    if (storageHashes[zkCert.zkCertStandard] === undefined) {
      storageHashes[zkCert.zkCertStandard] = keccak256(origin);
    }
    storageHashes[zkCert.zkCertStandard] = keccak256(
      (storageHashes[zkCert.zkCertStandard] as string) + JSON.stringify(zkCert),
    );
  }
  return storageHashes;
}
