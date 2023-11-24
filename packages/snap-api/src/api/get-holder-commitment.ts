import { RpcMethods } from './rpcEnums';
import { config } from '../config';
import { invokeSnap } from '../utils/invoke-snap';

export type HolderCommitmentData = {
  holderCommitment: string;
  encryptionPubKey: string;
};

/**
 * GetHolderCommitment queries the commitment identifying the holder from the snap.
 * The returned data is required by guardians to create ZK certificates.
 *
 * @param snapOrigin - Optional origin ID of the Snap if you want to use a non-default version.
 * @returns HolderCommitmentData or Error.
 * @throws RPCError on failure.
 */
export const getHolderCommitment = async (
  snapOrigin: string = config.defaultSnapOrigin,
) => {
  const response: HolderCommitmentData = await invokeSnap(
    {
      method: RpcMethods.GetHolderCommitment,
    },
    snapOrigin,
  );

  return response;
};
