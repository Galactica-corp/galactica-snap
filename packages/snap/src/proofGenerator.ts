// SPDX-License-Identifier: BUSL-1.1
import {
  MerkleProof,
  ZKCertificate,
  formatPrivKeyForBabyJub,
} from '@galactica-net/zkkyc';
import { text, heading, divider } from '@metamask/snaps-ui';
import { Buffer } from 'buffer';
import { buildEddsa } from 'circomlibjs';
import { buildBn128, buildBls12381 } from 'ffjavascript';
import { groth16 } from 'snarkjs';

import {
  GenZkKycRequestParams,
  ZkCertProof,
  HolderData,
  PanelContent,
} from './types';

/**
 * GenerateZkKycProof constructs and checks the zkKYC proof.
 *
 * @param params - Parameters defining the proof to be generated.
 * @param zkCert - ZkCert to be used for the proof.
 * @param holder - Holder data needed to derive private proof inputs.
 * @param merkleProof - Merkle proof of the zkCert in the zkCert registry.
 */
export const generateZkKycProof = async (
  params: GenZkKycRequestParams<any>,
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

    ...zkCert.fields,
    randomSalt: zkCert.randomSalt,

    ...zkCert.getOwnershipProofInput(holder.eddsaKey),

    userAddress: authorizationProof.userAddress,
    S2: authorizationProof.S,
    R8x2: authorizationProof.R8x,
    R8y2: authorizationProof.R8y,

    providerAx: zkCert.providerData.Ax,
    providerAy: zkCert.providerData.Ay,
    providerS: zkCert.providerData.S,
    providerR8x: zkCert.providerData.R8x,
    providerR8y: zkCert.providerData.R8y,

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
      processedParams.wasm,
      processedParams.zkeyHeader,
      processedParams.zkeySections,
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
 * Generate proof confirmation prompt for the user.
 *
 * @param params - Parameters defining the proof to be generated.
 * @param proof - Proof to be confirmed.
 * @param origin - Origin of the request.
 * @returns PanelContent for the proof confirmation prompt.
 */
export function createProofConfirmationPrompt(
  params: GenZkKycRequestParams<any>,
  proof: ZkCertProof,
  origin: string,
): PanelContent {
  const proofConfirmDialog = [
    heading('Disclosing zkCertificate Proof'),
    text(
      `With this action you will create a ${params.requirements.zkCertStandard.toUpperCase()} proof for ${origin}.
       This action tests whether your personal data fulfills the requirements of the proof.`,
    ),
    divider(),
  ];

  // Description of disclosures made by the proof have to be provided by the front-end because the snap can not analyze what the prover will do.
  if (params.description) {
    proofConfirmDialog.push(
      text(`Description of the proof (provided by ${origin}):`),
      text(params.description),
    );
  } else {
    throw new Error('Description of ZKP is missing');
  }

  // Generalize disclosure of inputs to any kind of inputs
  proofConfirmDialog.push(
    divider(),
    text(`The following proof parameters will be publicly visible:`),
  );

  if (params.publicInputDescriptions.length !== proof.publicSignals.length) {
    throw new Error(
      `Number of public input descriptions (${params.publicInputDescriptions.length}) does not match number of public inputs (${proof.publicSignals.length})`,
    );
  }
  proof.publicSignals.forEach((signal: any, index: number) => {
    proofConfirmDialog.push(
      text(
        `${params.publicInputDescriptions[index]}: ${JSON.stringify(signal)}`,
      ),
    );
  });
  return proofConfirmDialog;
}

/**
 * Prepare data from RPC request for snarkjs by converting it to the correct data types.
 * In the JSON message, arrays are base64 encoded.
 *
 * @param params - GenZkKycRequestParams.
 * @returns Prepared GenZkKycRequestParams.
 */
async function preprocessInput(
  params: GenZkKycRequestParams<any>,
): Promise<GenZkKycRequestParams<any>> {
  // Somehow we need to convert them to Uint8Array to avoid an error inside snarkjs.
  params.wasm = Uint8Array.from(Buffer.from(params.wasm, 'base64'));

  params.zkeyHeader.q = BigInt(params.zkeyHeader.q);
  params.zkeyHeader.r = BigInt(params.zkeyHeader.r);
  for (let i = 0; i < params.zkeySections.length; i++) {
    params.zkeySections[i] = Uint8Array.from(
      Buffer.from(params.zkeySections[i], 'base64'),
    );
  }
  params.zkeyHeader.vk_alpha_1 = Uint8Array.from(
    Buffer.from(params.zkeyHeader.vk_alpha_1, 'base64'),
  );
  params.zkeyHeader.vk_beta_1 = Uint8Array.from(
    Buffer.from(params.zkeyHeader.vk_beta_1, 'base64'),
  );
  params.zkeyHeader.vk_beta_2 = Uint8Array.from(
    Buffer.from(params.zkeyHeader.vk_beta_2, 'base64'),
  );
  params.zkeyHeader.vk_gamma_2 = Uint8Array.from(
    Buffer.from(params.zkeyHeader.vk_gamma_2, 'base64'),
  );
  params.zkeyHeader.vk_delta_1 = Uint8Array.from(
    Buffer.from(params.zkeyHeader.vk_delta_1, 'base64'),
  );
  params.zkeyHeader.vk_delta_2 = Uint8Array.from(
    Buffer.from(params.zkeyHeader.vk_delta_2, 'base64'),
  );

  /* eslint-disable-next-line require-atomic-updates */
  params.zkeyHeader.curve = await getCurveForSnarkJS(
    params.zkeyHeader.curveName,
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
