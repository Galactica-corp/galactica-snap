// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title AirdropGateway: manages airdrops for the Galactica
 */
contract AirdropGateway is AccessControl {
    // roles for access control
    bytes32 public constant CLIENT_ROLE = keccak256("CLIENT_ROLE");
    uint public distributionIndexCounter;
    mapping(uint => AirdropDistribution) public distributions;
    // distributionIndex -> userAddress -> registration status
    mapping(uint => mapping(address => bool)) public registeredUsers;
    // distributionIndex -> userAddress -> claimed status
    mapping(uint => mapping(address => bool)) public claimedUsers;

    event DistributionCreated(uint indexed distributionId, address client);
    event UserRegistered(uint indexed distributionId, address user);
    event UserClaimed(uint indexed distributionId, address user, uint amount);

    // struct to store airdrop distribution information
    struct AirdropDistribution {
        address[] requiredSBTs;
        uint registrationStartTime;
        uint registrationEndTime;
        uint claimStartTime;
        uint claimEndTime;
        address clientAddress;
        address tokenAddress;
        uint256 distributionAmount;
        uint256 registeredUserCount;
        uint256 tokenAmountPerUser;
        uint256 amountClaimed;
    }

    constructor(address owner) {
        // set admin, the role that can assign and revoke other roles
        _setupRole(DEFAULT_ADMIN_ROLE, owner);
    }

    function whitelistClient(address newClient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(CLIENT_ROLE, newClient);
    }

    function dewhitelistClient(address client) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(CLIENT_ROLE, client);
    }

    function setDistribution(address[] memory requiredSBTs, address tokenAddress, uint registrationStartTime, uint registrationEndTime, uint claimStartTime, uint claimEndTime) external onlyRole(CLIENT_ROLE) {
        require(registrationStartTime < registrationEndTime, "invalid registration time");
        require(registrationEndTime < claimStartTime, "claim can only start after registration ends");
        require(claimStartTime < claimEndTime, "invalid claim time");
        distributions[distributionIndexCounter] = AirdropDistribution(requiredSBTs, registrationStartTime, registrationEndTime, claimStartTime, claimEndTime, tokenAddress, msg.sender, 0, 0, 0, 0);
        emit DistributionCreated(distributionIndexCounter, msg.sender);
        distributionIndexCounter++;
    }

    /* deposit tokens to the distribution
     we choose to not sending the tokens to distribution contract address directly
     to just in case distinguish between two distributions with the same token address
    */
    function deposit(uint distributionId, uint amount) external onlyRole(CLIENT_ROLE) {
        IERC20(distributions[distributionId].tokenAddress).transferFrom(msg.sender, address(this), amount);
        require(distributions[distributionId].clientAddress == msg.sender, "only client can deposit");
        distributions[distributionId].distributionAmount += amount;
    }

    function withdrawRemainingToken(uint distributionId) external onlyRole(CLIENT_ROLE) {
        require(distributions[distributionId].clientAddress == msg.sender, "only client can deposit");
        require(distributions[distributionId].claimEndTime < block.timestamp, "claim has not ended yet");
        uint256 amountLeft = distributions[distributionId].distributionAmount - distributions[distributionId].amountClaimed;
        IERC20(distributions[distributionId].tokenAddress).transfer(msg.sender, amountLeft);
    }

    function register(uint distributionId, ) external {
        require(distributions[distributionId].registrationStartTime < block.timestamp, "registration has not started yet");
        require(distributions[distributionId].registrationEndTime > block.timestamp, "registration has ended");
        address[] memory requiredSBTs = distributions[distributionId].requiredSBTs;
        for (uint i = 0; i < requiredSBTs.length; i++) {
            require(IERC721(requiredSBTs[i]).balanceOf(msg.sender) > 0, "user does not have required SBT");
        }
        registeredUsers[distributionId][msg.sender] = true;
        distributions[distributionId].registeredUserCount++;
        emit UserRegistered(distributionId, msg.sender);
    }

    function claim(uint distributionId) external {
        require(distributions[distributionId].claimStartTime < block.timestamp, "claim has not started yet");
        require(distributions[distributionId].claimEndTime > block.timestamp, "claim has ended");
        require(registeredUsers[distributionId][msg.sender], "user has not registered");
        // calculate token amount per user if it hasn't been done yet
        if (distributions[distributionId].tokenAmountPerUser == 0) {
            distributions[distributionId].tokenAmountPerUser = distributions[distributionId].distributionAmount / distributions[distributionId].registeredUserCount;
        }
        IERC20(distributions[distributionId].tokenAddress).transfer(msg.sender, distributions[distributionId].tokenAmountPerUser);
        claimedUsers[distributionId][msg.sender] = true;
        emit UserClaimed(distributionId, msg.sender, distributions[distributionId].tokenAmountPerUser);
    }


}
