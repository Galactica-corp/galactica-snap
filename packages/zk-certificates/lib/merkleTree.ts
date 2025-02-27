/* Copyright (C) 2023 Galactica Network. This file is part of zkKYC. zkKYC is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. zkKYC is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details. You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>. */
import type { MerkleProof } from '@galactica-net/galactica-types';
import keccak256 from 'keccak256';

import { arrayToBigInt, SNARK_SCALAR_FIELD } from './helpers';
import type { Poseidon } from './poseidon';

/**
 * Class for managing and constructing merkle trees.
 */
export class MerkleTree {
  // Field of the curve used by Poseidon
  field: any;

  // hash value placeholder for empty merkle tree leaves
  emptyLeaf: string;

  // Depth of the tree
  depth: number;

  // hashes of empty branches
  emptyBranchLevels: string[];

  // nodes of the tree as array of levels each containing an array of hashes
  tree: string[][];

  // Poseidon instance to use for hashing
  poseidon: any;

  /**
   * Creates a MerkleTree.
   * @param depth - Depth of the tree.
   * @param poseidon - Poseidon instance to use for hashing.
   */
  constructor(depth: number, poseidon: any) {
    this.depth = depth;
    this.poseidon = poseidon;
    this.field = poseidon.F;

    this.emptyLeaf = (
      arrayToBigInt(keccak256('Galactica')) % SNARK_SCALAR_FIELD
    ).toString();

    // create empty tree
    this.emptyBranchLevels = this.calculateEmptyBranchHashes(depth);

    // initialize tree arrays. Because the tree is sparse, non zero nodes can be ommitted
    this.tree = Array(depth + 1);
    for (let i = 0; i < depth; i++) {
      this.tree[i] = [];
    }
    // set root
    this.tree[depth] = [this.emptyBranchLevels[depth]];
  }

  /**
   * Calculate hash of a node from its left and right children.
   * @param left - Left child of the node.
   * @param right - Right child of the node.
   * @returns Hash of the node.
   */
  calculateNodeHash(left: string, right: string): string {
    return this.field.toObject(this.poseidon([left, right])).toString();
  }

  /**
   * Calculate node hashes for empty branches of all depths.
   * @param depth - Max depth to calculate.
   * @returns Array of hashes for empty branches with [0] being an empty leaf and [depth] being the root.
   */
  calculateEmptyBranchHashes(depth: number): string[] {
    const levels: string[] = [];

    // depth 0 is just the empty leaf
    levels.push(this.emptyLeaf);

    for (let i = 1; i <= depth; i++) {
      levels.push(this.calculateNodeHash(levels[i - 1], levels[i - 1]));
    }

    return levels;
  }

  /**
   * Insert leaves into the tree and rebuilds the tree hashes up to the root.
   * A more efficient way would be inserting individual leaves
   * and updating hashes along the path to the root. This is not necessary for the curret use case
   * because inserting new leaves into an existing tree is done in the smart contract.
   * Here in the frontend or backend you want to build a new tree from scratch.
   * @param leaves - Array of leaf hashes to insert.
   */
  insertLeaves(leaves: string[]): void {
    if (leaves.length === 0) {
      return;
    }
    // insert leaves into new tree
    this.tree[0].push(...leaves);

    // rebuild tree.
    for (let level = 0; level < this.depth; level += 1) {
      // recalculate level above
      // TODO: do not recalculate branches that are full and were not changed
      this.tree[level + 1] = [];

      // here we can use the fact that the tree is sparse and just filled from the right
      // So we can use empty branch hashes if we are out of the used area
      for (let pos = 0; pos < this.tree[level].length; pos += 2) {
        this.tree[level + 1].push(
          this.calculateNodeHash(
            this.tree[level][pos],
            this.tree[level][pos + 1] ?? this.emptyBranchLevels[level],
          ),
        );
      }
    }
  }

  get root() {
    return this.tree[this.depth][0];
  }

  /**
   * Create a merkle proof for a leaf.
   * @param leaf - Hash of the leaf to prove.
   * @returns Merkle proof for the leaf.
   */
  createProof(leaf: string): MerkleProof {
    const path = [];
    // Search for leaf position in the tree
    // The leafIndex also works as binary array. If a bit is set, it means that the path is the right part of the parent node.
    const leafIndex = this.tree[0].indexOf(leaf);
    let curIndex = leafIndex;

    if (curIndex === -1) {
      throw new Error(
        `Can not create Merkle proof because ${leaf} is not in the list of leaves`,
      );
    }

    // Walk up the tree to the root
    for (let level = 0; level < this.depth; level += 1) {
      // check side we are on
      if (curIndex % 2 === 0) {
        // if the index is even we are on the left and need to get the node from the right
        path.push(
          this.tree[level][curIndex + 1] ?? this.emptyBranchLevels[level],
        );
      } else {
        path.push(this.tree[level][curIndex - 1]);
      }

      // Get index for next level
      curIndex = Math.floor(curIndex / 2);
    }

    return {
      leaf,
      pathElements: path,
      leafIndex,
    };
  }
}

/**
 * Calculates the root hash of a merkle tree from a proof.
 * @param proof - Merkle proof to calculate the root hash from.
 * @param poseidon - Poseidon instance to use for hashing.
 * @returns Root hash of the merkle tree.
 */
export function getMerkleRootFromProof(
  proof: MerkleProof,
  poseidon: Poseidon,
): string {
  let currentNode = proof.leaf;
  const dummyTree = new MerkleTree(0, poseidon);

  // hash up the tree to the root
  for (let i = 0; i < proof.pathElements.length; i++) {
    const isNodeOnRight = (BigInt(proof.leafIndex) >> BigInt(i)) % 2n === 1n;
    const [left, right] = isNodeOnRight
      ? [proof.pathElements[i], currentNode]
      : [currentNode, proof.pathElements[i]];
    currentNode = dummyTree.calculateNodeHash(left, right);
  }
  return currentNode;
}
