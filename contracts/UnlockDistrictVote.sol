// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract UnlockDistrictVote is Ownable, ReentrancyGuard {
    IERC20 public dstrxToken;
    uint256 public voteThreshold;
    uint256 public burnPercentOnLockIn; // represented in basis points (e.g., 1000 = 10%)

    // Mapping from districtId to total votes
    mapping(uint256 => uint256) public districtVotes;
    // Mapping from districtId to user address to vote amount
    mapping(uint256 => mapping(address => uint256)) public userVotes;
    // Mapping to track unlocked districts
    mapping(uint256 => bool) public unlockedDistricts;

    event VoteCast(address indexed voter, uint256 indexed districtId, uint256 amount);
    event VoteWithdrawn(address indexed voter, uint256 indexed districtId, uint256 amount);
    event RemainderWithdrawn(address indexed voter, uint256 indexed districtId, uint256 amount);
    event DistrictUnlocked(uint256 indexed districtId, uint256 totalVotes, uint256 burnedAmount);

    constructor(
        address initialOwner,
        address _dstrxToken,
        uint256 _voteThreshold,
        uint256 _burnPercentOnLockIn
    ) Ownable(initialOwner) {
        require(_dstrxToken != address(0), "Invalid token address");
        require(_burnPercentOnLockIn <= 10000, "Burn percentage cannot exceed 100%");

        dstrxToken = IERC20(_dstrxToken);
        voteThreshold = _voteThreshold;
        burnPercentOnLockIn = _burnPercentOnLockIn;
    }

    function vote(uint256 districtId, uint256 amount) external nonReentrant {
        require(!unlockedDistricts[districtId], "District already unlocked");
        require(amount > 0, "Amount must be greater than 0");

        // Transfer tokens from user to contract
        require(dstrxToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        userVotes[districtId][msg.sender] += amount;
        districtVotes[districtId] += amount;

        emit VoteCast(msg.sender, districtId, amount);

        // Check if threshold is met
        if (districtVotes[districtId] >= voteThreshold) {
            _unlockDistrict(districtId);
        }
    }

    function withdrawVote(uint256 districtId, uint256 amount) external nonReentrant {
        require(!unlockedDistricts[districtId], "District already unlocked");
        require(userVotes[districtId][msg.sender] >= amount, "Insufficient vote balance");

        userVotes[districtId][msg.sender] -= amount;
        districtVotes[districtId] -= amount;

        require(dstrxToken.transfer(msg.sender, amount), "Transfer failed");

        emit VoteWithdrawn(msg.sender, districtId, amount);
    }

    function withdrawAfterUnlock(uint256 districtId) external nonReentrant {
        require(unlockedDistricts[districtId], "District not unlocked");
        uint256 userVoteAmount = userVotes[districtId][msg.sender];
        require(userVoteAmount > 0, "No votes to withdraw");

        // Calculate remaining amount after burn
        uint256 remainingPercent = 10000 - burnPercentOnLockIn;
        uint256 withdrawAmount = (userVoteAmount * remainingPercent) / 10000;

        // Reset user's vote amount
        userVotes[districtId][msg.sender] = 0;

        // Transfer remaining tokens
        require(dstrxToken.transfer(msg.sender, withdrawAmount), "Transfer failed");

        emit RemainderWithdrawn(msg.sender, districtId, withdrawAmount);
    }

    function _unlockDistrict(uint256 districtId) internal {
        unlockedDistricts[districtId] = true;

        uint256 totalVotes = districtVotes[districtId];
        uint256 burnAmount = (totalVotes * burnPercentOnLockIn) / 10000;

        // Burn tokens
        ERC20Burnable(address(dstrxToken)).burn(burnAmount);

        emit DistrictUnlocked(districtId, totalVotes, burnAmount);
    }

    // Admin functions
    function setVoteThreshold(uint256 _voteThreshold) external onlyOwner {
        voteThreshold = _voteThreshold;
    }

    function setBurnPercentOnLockIn(uint256 _burnPercentOnLockIn) external onlyOwner {
        require(_burnPercentOnLockIn <= 10000, "Burn percentage cannot exceed 100%");
        burnPercentOnLockIn = _burnPercentOnLockIn;
    }
}
