// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.9;

import {IVerificationSBT} from '../interfaces/IVerificationSBT.sol';
import {IVerifierWrapper} from '../interfaces/IVerifierWrapper.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol';
import {Fallback} from '../helpers/Fallback.sol';

/// @author Galactica dev team
/// @title A global smart contract that store verification SBTs, minted by dApp for users submitting zk proofs
contract VerificationSBT is IVerificationSBT, Fallback {
    // mapping to store verification SBT
    mapping(uint256 => VerificationSBTInfo) public sbtData;

    address public issuingDApp;

    string public name;
    string public symbol;

    error NotAllowedForSBT();

    // base URI for NFTs
    string public baseURI;

    /// Block number at which the contract was created, so that the frontend can search for logs from here instead of searching from genesis.
    uint64 public deploymentBlock;

    // event emitted when a verification SBT is minted
    event VerificationSBTMinted(
        address indexed user,
        // if the SBTs should be consistent for different accounts of a user, we can use the humanID to identify the user
        bytes32 indexed humanID
    );

    /**
     * Constructor for the VerificationSBT contract.
     * @param _uri - URI to SBT metadata (description, image, etc.).
     * @param _name - Name of the SBT token.
     * @param _symbol - Symbol of the SBT token.
     * @param _issuingDApp - Address that can mint SBTs.
     */
    constructor(
        string memory _uri,
        string memory _name,
        string memory _symbol,
        address _issuingDApp
    ) {
        deploymentBlock = uint64(block.number);
        baseURI = _uri;
        name = _name;
        symbol = _symbol;
        issuingDApp = _issuingDApp;
    }

    /**
     * Simplified mint of a SBT for successful verification of a ZK proof without KYC data.
     * @param _user - Address of the users to mint the SBT for.
     * @param _verifierWrapper - Address of the verifier wrapper contract to keep track of verifier versions.
     * @param _expirationTime - Expiration time of the verification SBT.
     */
    function mintVerificationSBT(
        address _user,
        IVerifierWrapper _verifierWrapper,
        uint _expirationTime
    ) external {
        bytes32[] memory encryptedData = new bytes32[](0);
        uint256[2] memory userPubKey = [uint(0), uint(0)];
        bytes32 humanID = bytes32(0);
        uint256[2] memory providerPubKey = [uint(0), uint(0)];
        mintVerificationSBT(
            _user,
            _verifierWrapper,
            _expirationTime,
            encryptedData,
            userPubKey,
            humanID,
            providerPubKey
        );
    }

    /**
     * Mints a SBT for successful verification of a ZK proof.
     * @param _user - Address of the users to mint the SBT for.
     * @param _verifierWrapper - Address of the verifier wrapper contract to keep track of verifier versions.
     * @param _expirationTime - Expiration time of the verification SBT.
     * @param _encryptedData - Optional encrypted data of the verification SBT if fraud investigation is used.
     * @param _userPubKey - Optional public key of the user for ECDH.
     * @param _humanID - Optional human ID to identify the user if KYC identity uniqueness should be tracked across accounts.
     * @param _providerPubKey - Optional public key of the provider for ECDH.
     */
    function mintVerificationSBT(
        address _user,
        IVerifierWrapper _verifierWrapper,
        uint _expirationTime,
        bytes32[] memory _encryptedData,
        uint256[2] memory _userPubKey,
        bytes32 _humanID,
        uint256[2] memory _providerPubKey
    ) public {
        require(
            msg.sender == issuingDApp,
            'VerificationSBT: Only the issuing dApp can mint'
        );

        uint tokenId = getUsersTokenID(_user);

        sbtData[tokenId] = VerificationSBTInfo({
            verifierWrapper: _verifierWrapper,
            expirationTime: _expirationTime,
            verifierCodehash: address(_verifierWrapper.verifier()).codehash,
            encryptedData: _encryptedData,
            userPubKey: _userPubKey,
            humanID: _humanID,
            providerPubKey: _providerPubKey,
            tokenId: tokenId
        });

        emit VerificationSBTMinted(_user, _humanID);
        emit Transfer(address(0), _user, tokenId);
    }

    /**
     * Checks if a user holds a valid verification SBT (not expired, not outdated).
     * @param _user - Address of the user to check.
     */
    function isVerificationSBTValid(address _user) public view returns (bool) {
        VerificationSBTInfo storage verificationSBTInfo = sbtData[
            getUsersTokenID(_user)
        ];
        // we check 2 conditions
        // 1. the verifier wrapper address is set and the codehash of the verifier is still the same as the one referred to in the verification wrapper
        // 2. the expiration time hasn't happened yet
        return
            (address(verificationSBTInfo.verifierWrapper) != address(0)) &&
            (address(verificationSBTInfo.verifierWrapper.verifier()).codehash ==
                verificationSBTInfo.verifierCodehash) &&
            (verificationSBTInfo.expirationTime > block.timestamp);
    }

    function getUsersTokenID(address _user) public pure returns (uint256) {
        return uint256(uint160(_user));
    }

    function tokenIdToOwner(uint256 _tokenId) public pure returns (address) {
        return address(uint160(_tokenId));
    }

    function getVerificationSBTInfo(
        address _user
    ) public view returns (VerificationSBTInfo memory) {
        return sbtData[getUsersTokenID(_user)];
    }

    function getVerificationSBTInfoById(
        uint256 _tokenId
    ) public view returns (VerificationSBTInfo memory) {
        return sbtData[_tokenId];
    }

    function getHumanID(address _user) public view returns (bytes32) {
        return sbtData[getUsersTokenID(_user)].humanID;
    }

    function balanceOf(address user) external view returns (uint256 balance) {
        require(
            user != address(0),
            'VerificationSBT: address zero is not a valid owner'
        );
        // the user has a verification SBT iff the SBT is valid
        // meaning the balance expires with the SBT expiration date
        if (isVerificationSBTValid(user)) {
            return 1;
        }
        return 0;
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address user = tokenIdToOwner(tokenId);

        // we check if the user has received a verification SBT,
        // we do not use isVerificationSBTValid() here because we also want to consider expired SBTs
        VerificationSBTInfo storage verificationSBTInfo = sbtData[
            getUsersTokenID(user)
        ];
        // we check 2 conditions
        // 1. the verifier wrapper address is set and the codehash of the verifier is still the same as the one referred to in the verification wrapper
        // 2. the expiration time hasn't happened yet
        if (address(verificationSBTInfo.verifierWrapper) == address(0)) {
            return address(0);
        } else {
            return user;
        }
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == type(IERC721).interfaceId;
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return ownerOf(tokenId) != address(0);
    }

    function _requireMinted(uint256 tokenId) internal view {
        require(_exists(tokenId), 'ERC721: invalid token ID');
    }

    function tokenURI(uint256 tokenId) public view returns (string memory) {
        _requireMinted(tokenId);
        return baseURI;
    }

    function approve(address, uint256) external pure {
        revert NotAllowedForSBT();
    }

    function getApproved(uint256) external pure returns (address) {
        revert NotAllowedForSBT();
    }

    function setApprovalForAll(address, bool) external pure {
        revert NotAllowedForSBT();
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        revert NotAllowedForSBT();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert NotAllowedForSBT();
    }

    function safeTransferFrom(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure {
        revert NotAllowedForSBT();
    }

    function transferFrom(address, address, uint256) external pure {
        revert NotAllowedForSBT();
    }
}
