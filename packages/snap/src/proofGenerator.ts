// SPDX-License-Identifier: BUSL-1.1
import { MerkleProof } from '@galactica-net/galactica-types';
import {
  GenZkProofParams,
  ZkCertInputType,
  ZkCertProof,
} from '@galactica-net/snap-api';
import { ZKCertificate, formatPrivKeyForBabyJub } from '@galactica-net/zkkyc';
import { Buffer } from 'buffer';
import { buildEddsa } from 'circomlibjs';
import { buildBn128, buildBls12381 } from 'ffjavascript';
import { groth16 } from 'snarkjs';

import { HolderData } from './types';

/**
 * GenerateZkKycProof constructs and checks the zkKYC proof.
 *
 * @param params - Parameters defining the proof to be generated.
 * @param zkCert - ZkCert to be used for the proof.
 * @param holder - Holder data needed to derive private proof inputs.
 * @param merkleProof - Merkle proof of the zkCert in the zkCert registry.
 */
export const generateZkKycProof = async (
  params: GenZkProofParams<ZkCertInputType>,
  zkCert: ZKCertificate,
  holder: HolderData,
  merkleProof: MerkleProof,
): Promise<ZkCertProof> => {
  const processedParams = await preprocessInput(params);

  const authorizationProof = zkCert.getAuthorizationProofInput(
    holder.eddsaKey,
    params.userAddress,
  );

  // Generate private key for sending encrypted messages to institutions
  // It should be different if the ZKP is sent from another address
  // Therefore generating it from the private holder eddsa key and the user address
  const eddsa = await buildEddsa();
  const encryptionHashBase = eddsa.poseidon.F.toObject(
    eddsa.poseidon([holder.eddsaKey, params.userAddress, zkCert.randomSalt]),
  ).toString();
  const encryptionPrivKey = formatPrivKeyForBabyJub(
    encryptionHashBase,
    eddsa,
  ).toString();

  const inputs: any = {
    ...processedParams.input,

    ...zkCert.content,
    randomSalt: zkCert.randomSalt,

    ...zkCert.getOwnershipProofInput(holder.eddsaKey),

    userAddress: authorizationProof.userAddress,
    s2: authorizationProof.s,
    r8x2: authorizationProof.r8x,
    r8y2: authorizationProof.r8y,

    providerAx: zkCert.providerData.ax,
    providerAy: zkCert.providerData.ay,
    providerS: zkCert.providerData.s,
    providerR8x: zkCert.providerData.r8x,
    providerR8y: zkCert.providerData.r8y,

    root: merkleProof.root,
    pathElements: merkleProof.pathElements,
    pathIndices: merkleProof.pathIndices,

    userPrivKey: encryptionPrivKey,

    humanID: zkCert.getHumanID(processedParams.input.dAppAddress),
  };

  // console.log('proof inputs: TODO: remove this debug output');
  // console.log(JSON.stringify(inputs, null, 1));

  try {
    const { proof, publicSignals } = await groth16.fullProveMemory(
      inputs,
      processedParams.prover.wasm,
      processedParams.prover.zkeyHeader,
      processedParams.prover.zkeySections,
    );

    // console.log('Calculated proof: ');
    // console.log(JSON.stringify(proof, null, 1));

    return { proof, publicSignals };
  } catch (error) {
    console.log('proof generation failed');
    console.log(error.stack);
    throw error;
  }
};

/**
 * Prepare data from RPC request for snarkjs by converting it to the correct data types.
 * In the JSON message, arrays are base64 encoded.
 *
 * @param params - GenZkKycRequestParams.
 * @returns Prepared GenZkKycRequestParams.
 */
async function preprocessInput(
  params: GenZkProofParams<ZkCertInputType>,
): Promise<GenZkProofParams<ZkCertInputType>> {
  // Somehow we need to convert them to Uint8Array to avoid an error inside snarkjs.
  params.prover.wasm = Uint8Array.from(
    Buffer.from(params.prover.wasm, 'base64'),
  );

  params.prover.zkeyHeader.q = BigInt(params.prover.zkeyHeader.q);
  params.prover.zkeyHeader.r = BigInt(params.prover.zkeyHeader.r);
  for (let i = 0; i < params.prover.zkeySections.length; i++) {
    params.prover.zkeySections[i] = Uint8Array.from(
      Buffer.from(params.prover.zkeySections[i], 'base64'),
    );
  }
  params.prover.zkeyHeader.vk_alpha_1 = Uint8Array.from(
    Buffer.from(params.prover.zkeyHeader.vk_alpha_1, 'base64'),
  );
  params.prover.zkeyHeader.vk_beta_1 = Uint8Array.from(
    Buffer.from(params.prover.zkeyHeader.vk_beta_1, 'base64'),
  );
  params.prover.zkeyHeader.vk_beta_2 = Uint8Array.from(
    Buffer.from(params.prover.zkeyHeader.vk_beta_2, 'base64'),
  );
  params.prover.zkeyHeader.vk_gamma_2 = Uint8Array.from(
    Buffer.from(params.prover.zkeyHeader.vk_gamma_2, 'base64'),
  );
  params.prover.zkeyHeader.vk_delta_1 = Uint8Array.from(
    Buffer.from(params.prover.zkeyHeader.vk_delta_1, 'base64'),
  );
  params.prover.zkeyHeader.vk_delta_2 = Uint8Array.from(
    Buffer.from(params.prover.zkeyHeader.vk_delta_2, 'base64'),
  );

  /* eslint-disable-next-line require-atomic-updates */
  params.prover.zkeyHeader.curve = await getCurveForSnarkJS(
    params.prover.zkeyHeader.curveName,
  );

  return params;
}

/**
 * Reconstruct curve from name for the snarkjs zkey header.
 *
 * @param name - Name of the curve used for the ZKP.
 * @returns Curve object.
 */
async function getCurveForSnarkJS(name: string): Promise<any> {
  let curve;
  // normalize name
  const validChars = name.toUpperCase().match(/[A-Za-z0-9]+/gu);
  if (!validChars) {
    throw new Error(`Invalid curve name '${name}'`);
  }
  const normalizedName = validChars.join('');
  if (['BN128', 'BN254', 'ALTBN128'].includes(normalizedName)) {
    curve = await buildBn128(true);
  } else if (['BLS12381'].includes(normalizedName)) {
    curve = await buildBls12381(true);
  } else {
    throw new Error(`Curve not supported: ${name}`);
  }
  return curve;
}
