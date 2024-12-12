// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import '../Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '../interfaces/IVerifierWrapper.sol';
import './VerificationSBT.sol';
import {Fallback} from '../helpers/Fallback.sol';

/**
 * @title AirdropGateway: manages airdrops for the Galactica
 */
contract SBTManager is Ownable, Fallback {
    mapping(uint => address) public SBTIndexToSBTAddress;
    mapping(uint => address) public SBTIndexToSBTVerifierWrapper;

    constructor(address _owner) Ownable(_owner) {}

    function setSBT(uint index, address SBTAddress) external onlyOwner {
        SBTIndexToSBTAddress[index] = SBTAddress;
    }

    function setVerifierWrapper(
        uint index,
        address SBTVerifierWrapperAddress
    ) external onlyOwner {
        SBTIndexToSBTVerifierWrapper[index] = SBTVerifierWrapperAddress;
    }

    //
    function mintSBT(
        uint index,
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory input
    ) public {
        IVerifierWrapper verifierWrapper = IVerifierWrapper(
            SBTIndexToSBTVerifierWrapper[index]
        );
        /* In the first 3 cases we deal with TwitterFollowerCount circuit with
          - INDEX_VERIFICATION_EXPIRATION = 1
          - INDEX_FOLLOWERS_COUNT_THRESHOLD = 7
          In the other two cases we deal with TwitterCreationTime circuit with
          - INDEX_CREATION_TIME_LOWER_BOUND = 7
          - INDEX_CREATION_TIME_UPPER_BOUND = 8
          */
        uint expirationTime = input[1];
        if (index == 0) {
            require(
                input[7] == 100,
                'Followers count threshold is not set correctly'
            );
        } else if (index == 1) {
            require(
                input[7] == 1000,
                'Followers count threshold is not set correctly'
            );
        } else if (index == 2) {
            require(
                input[7] == 10000,
                'Followers count threshold is not set correctly'
            );
        } else if (index == 3) {
            // in this case we require that the account is created before 2020-01-01
            require(
                input[7] == 0,
                'Creation time lower bound is set correctly'
            );
            require(
                input[8] == 1577836800,
                'Creation time upper bound is not set correctly'
            );
        } else if (index == 4) {
            // in this case we require that the account is created after 2024-01-01 and before 2025-01-01
            require(
                input[7] == 1704067200,
                'Creation time lower bound is not set correctly'
            );
            require(
                input[8] == 1735689600,
                'Creation time upper bound is not set correctly'
            );
        } else {
            revert('Invalid index');
        }
        require(
            verifierWrapper.verifyProof(a, b, c, input),
            'Proof is not valid'
        );

        VerificationSBT(SBTIndexToSBTAddress[index]).mintVerificationSBT(
            msg.sender,
            verifierWrapper,
            expirationTime
        );
    }
}
