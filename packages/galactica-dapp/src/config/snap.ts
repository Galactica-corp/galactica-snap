/**
 * The snap origin to use.
 * Will default to the local hosted snap if no value is provided in environment.
 */
export const defaultSnapOrigin =
  process.env.REACT_APP_SNAP_ORIGIN ?? `local:http://localhost:8080`;

export const npmSnapOrigin = `npm:@galactica-net/snap`;

export const zkKYCAgeProofPublicInputDescriptions = [
  'human id',
  'user pubkey Ax',
  'user pubkey Ay',
  'proof valid',
  'error code',
  'verification SBT expiration',
  'encrypted fraud investigation shard for institution 1 part 1',
  'encrypted fraud investigation shard for institution 1 part 2',
  'encrypted fraud investigation shard for institution 2 part 1',
  'encrypted fraud investigation shard for institution 2 part 2',
  'encrypted fraud investigation shard for institution 3 part 1',
  'encrypted fraud investigation shard for institution 3 part 2',
  'merkle root',
  'current time',
  'user address',
  'current year',
  'current month',
  'current day',
  'age threshold',
  'dapp address',
  'zkKYC guardian pubkey Ax',
  'zkKYC guardian pubkey Ay',
  'institution 1 pubkey Ax',
  'institution 1 pubkey Ay',
  'institution 2 pubkey Ax',
  'institution 2 pubkey Ay',
  'institution 3 pubkey Ax',
  'institution 3 pubkey Ay',
];

export const kycRequirementsDemoDAppPublicInputDescriptions = [
  'human id',
  'user pubkey Ax',
  'user pubkey Ay',
  'proof valid',
  'error code',
  'verification SBT expiration',
  'merkle root',
  'current time',
  'user address',
  'current year',
  'current month',
  'current day',
  'age threshold',
  'sanctioned country hash 1',
  'sanctioned country hash 2',
  'sanctioned country hash 3',
  'sanctioned country hash 4',
  'sanctioned country hash 5',
  'sanctioned country hash 6',
  'sanctioned country hash 7',
  'sanctioned country hash 8',
  'sanctioned country hash 9',
  'sanctioned country hash 10',
  'sanctioned country hash 11',
  'sanctioned country hash 12',
  'sanctioned country hash 13',
  'sanctioned country hash 14',
  'sanctioned country hash 15',
  'sanctioned country hash 16',
  'sanctioned country hash 17',
  'sanctioned country hash 18',
  'sanctioned country hash 19',
  'sanctioned country hash 20',
  'dapp address',
  'zkKYC guardian pubkey Ax',
  'zkKYC guardian pubkey Ay',
];

export const zkKYCPublicInputDescriptions = [
  'human id',
  'user pubkey Ax',
  'user pubkey Ay',
  'proof valid',
  'verification SBT expiration',
  'merkle root',
  'current time',
  'user address',
  'dapp address',
  'zkKYC guardian pubkey Ax',
  'zkKYC guardian pubkey Ay',
];

export const twitterFollowersCountProofPublicInputDescriptions = [
  'proof valid',
  'verification SBT expiration',
  'merkle root',
  'current time',
  'user address',
  `guardian pubkey Ax`,
  `guardian pubkey Ay`,
  `followers threshold`,
];

export const twitterCreationTimeProofPublicInputDescriptions = [
  'proof valid',
  'verification SBT expiration',
  'merkle root',
  'current time',
  'user address',
  `guardian pubkey Ax`,
  `guardian pubkey Ay`,
  `creation time lower bound`,
  `creation time upper bound`,
];
