// SPDX-License-Identifier: BUSL-1.1
import { OnRpcRequestHandler } from '@metamask/snaps-types';
import { panel, text, heading, divider } from '@metamask/snaps-ui';

import { generateZkKycProof } from './proofGenerator';
import { RpcResponseErr, RpcMethods, RpcResponseMsg } from './rpcEnums';
import { getState, saveState } from './stateManagement';
import {
  ExportRequestParams,
  GenZkKycRequestParams,
  HolderData,
  ImportRequestParams,
  MerkleProofUpdateRequestParams,
  SnapRpcProcessor,
  PanelContent,
  DeleteRequestParams,
} from './types';
import {
  getZkCertStorageHashes,
  getZkCertStorageOverview,
} from './zkCertHandler';
import { selectZkCert } from './zkCertSelector';

/**
 * Handler for the rpc request that processes real requests and unit tests alike.
 * It has all inputs as function parameters instead of relying on global variables.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * @param snap - The SnapProvider (snap).
 * @returns `null` if the request succeeded.
 * @throws If the request method is not valid for this snap.
 * @throws If the `snap_dialog` call failed.
 */
export const processRpcRequest: SnapRpcProcessor = async (
  { origin, request },
  snap,
) => {
  const state = await getState(snap);
  let confirm: any;
  let holder: HolderData;

  switch (request.method) {
    case RpcMethods.GenZkKycProof: {
      // parse ZKP inputs
      const genParams = request.params as GenZkKycRequestParams<any>;
      // TODO: check input validity
      if (genParams.userAddress === undefined) {
        throw new Error(`userAddress missing in request parameters.`);
      }
      if (genParams.requirements.zkCertStandard === undefined) {
        throw new Error(`ZkCert standard missing in request parameters.`);
      }

      const proofConfirmDialog = [
        heading('Generating zkCertificate Proof'),
        text(
          `With this action you will create a ${genParams.requirements.zkCertStandard.toUpperCase()} proof for Galactica.com.
           This action tests whether your personal data fulfills the requirements of the proof.`,
        ),
        divider(),
      ];

      // Description of disclosures made by the proof have to be provided by the front-end because the snap can not analyze what the prover will do.
      if (genParams.disclosureDescription !== undefined) {
        proofConfirmDialog.push(
          text(`Further description of disclosures:`),
          text(genParams.disclosureDescription),
          text(`(Description provided by ${origin}. The snap can not verify if the prover actually meets those disclosures.)`),
        );
      } else {
        proofConfirmDialog.push(
          text(`No further description of disclosures provided by ${origin}.`),
        );
      }

      // Generalize disclosure of inputs to any kind of inputs
      proofConfirmDialog.push(
        divider(),
        text(`The following proof parameters will be publicly visible:`),
      );

      for (const parameter of Object.keys(genParams.input)) {
        proofConfirmDialog.push(
          text(
            `${parameter}: ${JSON.stringify(genParams.input[parameter], null, 2)}`,
          ),
        );
      }

      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel(proofConfirmDialog),
        },
      });

      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      const zkCert = await selectZkCert(
        snap,
        state.zkCerts,
        genParams.requirements.zkCertStandard,
      );

      const searchedHolder = state.holders.find(
        (candidate) => candidate.holderCommitment === zkCert.holderCommitment,
      );
      if (searchedHolder === undefined) {
        throw new Error(
          `Holder for commitment ${zkCert.holderCommitment} could not be found. Please use Metamask with the same mnemonic as when you created this holder commitment.`,
        );
      } else {
        holder = searchedHolder;
      }

      const searchedZkCert = state.zkCerts.find(
        (cert) => cert.leafHash === zkCert.leafHash,
      );

      if (searchedZkCert === undefined) {
        throw new Error(
          `zkCert with leafHash ${zkCert.leafHash} could not be found.`,
        );
      }

      const proof = generateZkKycProof(
        genParams,
        zkCert,
        holder,
        searchedZkCert.merkleProof,
      );
      return proof;
    }

    case RpcMethods.ClearStorage: {
      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Clear zkCert and holder storage?'),
            text(
              `Do you want to delete the zkCertificates stored in Metamask? (requested by ${origin})`,
            ),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      await saveState(snap, { holders: [], zkCerts: [] });
      return RpcResponseMsg.StorageCleared;
    }

    case RpcMethods.ImportZkCert: {
      const importParams = request.params as ImportRequestParams;

      // check that there is a holder setup for this zkCert
      const searchedHolder = state.holders.find(
        (candidate) => candidate.holderCommitment === importParams.zkCert.holderCommitment,
      );
      if (searchedHolder === undefined) {
        throw new Error(
          `Could not find Holder for commitment ${importParams.zkCert.holderCommitment}. Please use Metamask with the same mnemonic as when you created this holder commitment.`,
        );
      }

      const listZkCertsFlag = importParams.listZkCerts == true;

      // prevent uploading the same zkCert again
      const searchedZkCert = state.zkCerts.find(
        (candidate) => candidate.leafHash === importParams.zkCert.leafHash,
      );
      if (searchedZkCert) {
        return RpcResponseMsg.ZkCertAlreadyImported;
      }

      const prompt: PanelContent = [
        heading('Import your zkCertificate into your MetaMask'),
        text(`With this action you are importing your zkKYC in your MetaMask in order to generate ZK proofs. ZK proofs are generated using the Galactica Snap.`),
      ]
      if (listZkCertsFlag) {
        prompt.push(
          divider(),
          text(`The application also requests to get an overview of zkCertificates stored in your MetaMask. This overview does not contain personal information, only metadata (expiration date of the document, issue, and verification level).`),
        )
      }

      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel(prompt),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }
      state.zkCerts.push(importParams.zkCert);
      await saveState(snap, state);

      if (listZkCertsFlag) {
        return getZkCertStorageOverview(state.zkCerts);
      } else {
        return RpcResponseMsg.ZkCertImported;
      }
    }

    case RpcMethods.ExportZkCert: {
      const exportParams = request.params as ExportRequestParams;

      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Export zkCert?'),
            text(
              `Do you want to export a zkCert? (provided to ${origin} for saving it to a file)`,
            ),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      const zkCertForExport = await selectZkCert(snap, state.zkCerts, exportParams.zkCertStandard);
      const zkCertStorageData = state.zkCerts.find(
        (cert) => cert.leafHash === zkCertForExport.leafHash,
      );

      return zkCertStorageData;
    }

    case RpcMethods.GetHolderCommitment: {
      if (state.holders.length === 0) {
        throw new Error(RpcResponseErr.MissingHolder);
      }

      // Assuming that we have a single holder. Might change when this is implemented: https://github.com/MetaMask/snaps/discussions/1364#discussioncomment-6111359
      holder = state.holders[0];

      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Provide holder commitment?'),
            text(`Do you want to provide your holder commitment to ${origin}?`),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      return holder.holderCommitment;
    }

    case RpcMethods.ListZkCerts: {
      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Provide the list of your zkCertificates to the application'),
            text(
              `The application "${origin}" requests to get an overview of zkCertificates stored in your MetaMask. This overview does not contain personal information, only metadata (expiration date of the document, issue, and verification level).`,
            ),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      return getZkCertStorageOverview(state.zkCerts);
    }

    case RpcMethods.GetZkCertStorageHashes: {
      // does not need confirmation as it does not leak any personal or tracking data
      return getZkCertStorageHashes(state.zkCerts, origin);
    }

    case RpcMethods.GetZkCertHash: {
      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Provide zkCert hash?'),
            text(
              `Do you want to provide the leaf hashes of your zkCerts to ${origin}?`,
            ),
            text(
              `We suggest doing this only to update Merkle proofs. Only Do this on sites you trust to handle the unique ID of your zkCert confidentially.`,
            ),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      return state.zkCerts.map((zkCert) => zkCert.leafHash);
    }

    // To preserve privacy by not using the same merkle proof every time, the merkle proof can be updated.
    case RpcMethods.UpdateMerkleProof: {
      const merkleUpdateParams =
        request.params as MerkleProofUpdateRequestParams;

      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Update Merkle proofs?'),
            text(
              `Do you want to update the merkle proofs of your zkCerts as suggested by ${origin}?`,
            ),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      for (const merkleProof of merkleUpdateParams.proofs) {
        let foundZkCert = false;
        for (const zkCert of state.zkCerts) {
          if (zkCert.leafHash === merkleProof.leaf) {
            zkCert.merkleProof = merkleProof;
            foundZkCert = true;
            break;
          }
        }
        if (!foundZkCert) {
          throw new Error(
            `The zkCert with leaf hash ${merkleProof.leaf} was not found in the wallet. Please import it before updating the Merkle proof.`,
          );
        }
      }

      await saveState(snap, state);
      return RpcResponseMsg.MerkleProofsUpdated;
    }

    case RpcMethods.DeleteZkCert: {
      const deleteParams = request.params as DeleteRequestParams;

      // get existing zkCerts that the fit to the delete filter
      const zkCertToDelete = await selectZkCert(
        snap,
        state.zkCerts,
        deleteParams.zkCertStandard,
        deleteParams.expirationDate,
        deleteParams.ProviderAx,
      );

      confirm = await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Delete zkCert?'),
            text(`Do you want to delete the following zkCert from MetaMask?`),
            text(`${zkCertToDelete.did}`),
          ]),
        },
      });
      if (!confirm) {
        throw new Error(RpcResponseErr.RejectedConfirm);
      }

      state.zkCerts = state.zkCerts.filter(zkCert => zkCert.leafHash != zkCertToDelete.leafHash);
      await saveState(snap, state);
      return RpcResponseMsg.ZkCertDeleted;
    }

    default: {
      throw new Error(RpcResponseErr.UnknownMethod);
    }
  }
};

/**
 * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that
 * invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * @returns The result of the request as string. TODO: Use more strict type.
 * @throws If the request method is not valid for this snap.
 * @throws If the `snap_dialog` call failed.
 */
export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  console.log('got request', request.method);

  // forward to common function shared with unit tests
  // passing global objects object from snap environment
  return await processRpcRequest({ origin, request }, snap);
};
