// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;
import {VerificationSBT} from '../SBT_related/VerificationSBT.sol';
import {ITwitterZkCertificateVerifier} from '../interfaces/ITwitterZkCertificateVerifier.sol';
import {IVerificationSBT} from '../interfaces/IVerificationSBT.sol';
import {IVerificationSBTIssuer} from '../interfaces/IVerificationSBTIssuer.sol';

/**
 * @title TwitterRequirementsDemoDApp
 * @author Galactica dev team
 * @notice An example DApp that requires a twitter proof to issue a Verification SBT.
 *  Registration can be repeated.
 *  The requirements of the TwitterZkCertificate are defined in the verifierWrapper.
 */
contract TwitterRequirementsDemoDApp is IVerificationSBTIssuer {
    IVerificationSBT public sbt;
    ITwitterZkCertificateVerifier public verifierWrapper;

    constructor(
        ITwitterZkCertificateVerifier _verifierWrapper,
        string memory _sbt_uri,
        string memory _sbt_name,
        string memory _sbt_symbol
    ) {
        sbt = new VerificationSBT(
            _sbt_uri,
            _sbt_name,
            _sbt_symbol,
            address(this)
        );
        verifierWrapper = _verifierWrapper;
    }

    /**
     * @notice passedRequirements checks if an address provided a valid TwitterZkCertificate and got a verification SBT
     * @param account the address to check
     */
    function passedRequirements(address account) public view returns (bool) {
        return sbt.isVerificationSBTValid(account);
    }

    function checkRequirements(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[] memory input
    ) public {
        uint dAppAddress = input[verifierWrapper.INDEX_DAPP_ID()];

        // check that the public dAppAddress is correct
        require(
            dAppAddress == uint(uint160(address(this))),
            'incorrect dAppAddress'
        );

        // check the zk proof
        require(verifierWrapper.verifyProof(a, b, c, input), 'invalid proof');

        //afterwards we mint the verification SBT
        uint expirationTime = input[
            verifierWrapper.INDEX_VERIFICATION_EXPIRATION()
        ];

        bytes32[] memory noEncryptedData;
        sbt.mintVerificationSBT(
            msg.sender,
            verifierWrapper,
            expirationTime
        );
    }

    /**
     * @notice For demo purposes, the verification status of a user can be reset by replacing the verificationSBT with an invalid one.
     * @dev This function is only for demo purposes and should not be used in production.
     */
    function resetVerification() external {
        bytes32[] memory noEncryptedData;
        sbt.mintVerificationSBT(
            msg.sender,
            verifierWrapper,
            0, // expired
            noEncryptedData,
            [uint(0), uint(0)],
            0,
            [uint(0), uint(0)]
        );
    }
}
