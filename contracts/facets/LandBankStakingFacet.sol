// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Base} from "@solidstate/contracts/token/ERC721/base/IERC721Base.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {LibLandBank} from "../libraries/LibLandBank.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";

interface IMintableToken is IERC20 {
    function mint(address to, uint256 amount) external;
    function totalSupply() external view returns (uint256);
}

contract LandBankStakingFacet is ReentrancyGuard {
    using EnumerableSet for EnumerableSet.UintSet;
    using LibLandBank for LibLandBank.LandBankStorage;

    // Events
    event Staked(address indexed user, uint256 indexed tokenId);
    event Unstaked(address indexed user, uint256 indexed tokenId);
    event RewardsClaimed(address indexed user, uint256 amount);

    // Helper function to calculate rewards for a single staked LandPixel token
    function _calculateTokenRewards(
        uint256 tokenId,
        uint256 currentAccumulatedRewards
    ) internal view returns (uint256) {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        LibLandBank.Stake storage stake = s.tokenStakes[tokenId];

        if (stake.owner == address(0)) return 0;

        // Sanity check to avoid any value underflow issues
        if (currentAccumulatedRewards <= stake.rewardDebt) return 0;

        return (currentAccumulatedRewards - stake.rewardDebt) / LibLandBank.PRECISION;
    }

    // Function to calculate current total staking rewards per block
    function calculateRewardPerBlock() public view returns (uint256) {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();

        if (s.totalStaked == 0) return 0;

        uint256 remainingAllocation = LibLandBank.USER_TOTAL_SUPPLY - s.stakingMintedRewards;

        // Calculate the reward per block as 1/100M of remaining allocation
        return remainingAllocation / LibLandBank.STAKE_REWARD_BASE_DIVISOR;
    }

    /*******************************************************************************************\
     *  @dev stakeLandPixel: function to stake a LandPixel in the LandBank
     *  @param tokenId the District ID of the LandPixel being staked
     *  The LandBank contract must be approved for transferring the LandPixel NFT
     *  This calls LibLandBank.updateAccumulatedRewards so the accumulator factors in the stake
     *  This emits a {Staked} event
    \*******************************************************************************************/
    function stakeLandPixel(uint256 tokenId) external nonReentrant {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();

        IERC721Base nftContract = IERC721Base(s.landPixelAddress);
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not token owner");
        require(s.tokenStakes[tokenId].owner == address(0), "Already staked");

        LibLandBank.updateAccumulatedRewards();

        // Transfer NFT to contract
        nftContract.transferFrom(msg.sender, address(this), tokenId);

        // Create new stake
        s.tokenStakes[tokenId] = LibLandBank.Stake({
            owner: msg.sender,
            startBlock: block.number,
            rewardDebt: s.accumulatedRewardsPerShare
        });

        // Add to user's token set
        s.userTokenIds[msg.sender].add(tokenId);
        s.totalStaked++;

        emit Staked(msg.sender, tokenId);
    }

    /*******************************************************************************************\
     *  @dev unstakeLandPixel: function to unstake a LandPixel and withdraw it from the LandBank
     *  @param tokenId the District ID of the LandPixel being unstaked
     *  This calls LibLandBank.updateAccumulatedRewards to ensure that the accumulator updates
     *  This emits an {Unstaked} event
    \*******************************************************************************************/
    function unstakeLandPixel(uint256 tokenId) external nonReentrant {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();

        LibLandBank.Stake storage stake = s.tokenStakes[tokenId];
        require(stake.owner == msg.sender, "Not stake owner");

        LibLandBank.updateAccumulatedRewards();

        // Calculate and add pending rewards
        uint256 pending = _calculateTokenRewards(tokenId, s.accumulatedRewardsPerShare);
        if (pending > 0) {
            s.userPendingRewards[msg.sender] += pending;
        }

        // Reset the stake's rewardDebt to 0 when unstaking
        stake.rewardDebt = 0;

        // Clear stake data
        delete s.tokenStakes[tokenId];
        s.totalStaked--;
        s.userTokenIds[msg.sender].remove(tokenId);

        // Transfer NFT back to user
        IERC721Base(s.landPixelAddress).transferFrom(address(this), msg.sender, tokenId);

        emit Unstaked(msg.sender, tokenId);
    }

    /*******************************************************************************************\
     * @dev claimRewardForToken: claims rewards for a single staked LandPixel token
     * @param tokenId the ID of the LandPixel token to claim rewards for
     * This calls LibLandBank.updateAccumulatedRewards so the accumulator updates properly
     * The staking rewards will be minted directly to the claiming user
     * This emits a {RewardsClaimed} event
    \*******************************************************************************************/
    function claimRewardForToken(uint256 tokenId) external nonReentrant {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        LibLandBank.Stake storage stake = s.tokenStakes[tokenId];

        require(stake.owner == msg.sender, "Not stake owner");

        LibLandBank.updateAccumulatedRewards();

        uint256 pending = _calculateTokenRewards(tokenId, s.accumulatedRewardsPerShare);
        require(pending > 0, "No rewards to claim");

        // Update stake's reward debt
        stake.rewardDebt = s.accumulatedRewardsPerShare;

        // Update state before minting
        s.stakingMintedRewards += pending;

        // Ensure we don't exceed our allocation
        require(s.stakingMintedRewards <= LibLandBank.USER_TOTAL_SUPPLY, "Exceeds staking allocation");

        // Mint rewards directly to user
        IMintableToken(s.dstrxTokenAddress).mint(msg.sender, pending);

        emit RewardsClaimed(msg.sender, pending);
    }

    /*******************************************************************************************\
     *  @dev claimAllRewards: function to claim all staking rewards for the calling user
     *  This calls LibLandBank.updateAccumulatedRewards so the accumulator updates properly
     *  The staking rewards will be minted directly to the claiming user
     *  This emits a {RewardsClaimed} event
    \*******************************************************************************************/
    function claimAllRewards() external nonReentrant {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        EnumerableSet.UintSet storage userTokens = s.userTokenIds[msg.sender];

        LibLandBank.updateAccumulatedRewards();
        uint256 totalPending = s.userPendingRewards[msg.sender];

        // Calculate rewards for currently staked tokens
        uint256 length = userTokens.length();
        for (uint256 i = 0; i < length; ) {
            uint256 tokenId = userTokens.at(i);
            LibLandBank.Stake storage stake = s.tokenStakes[tokenId];

            // Sanity check for value underflow
            if (s.accumulatedRewardsPerShare > stake.rewardDebt) {
                uint256 pending = (s.accumulatedRewardsPerShare - stake.rewardDebt) / LibLandBank.PRECISION;
                totalPending += pending;
            }

            stake.rewardDebt = s.accumulatedRewardsPerShare;

            unchecked {
                ++i;
            }
        }

        require(totalPending > 0, "No rewards to claim");

        // Update state before minting
        s.userPendingRewards[msg.sender] = 0;
        s.stakingMintedRewards += totalPending;

        // Ensure we don't exceed our allocation
        require(s.stakingMintedRewards <= LibLandBank.USER_TOTAL_SUPPLY, "Exceeds staking allocation");

        // Mint rewards directly to user
        IMintableToken(s.dstrxTokenAddress).mint(msg.sender, totalPending);

        emit RewardsClaimed(msg.sender, totalPending);
    }

    // View functions
    function getPendingRewards(address user) external view returns (uint256) {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        EnumerableSet.UintSet storage userTokens = s.userTokenIds[user];

        uint256 pending = s.userPendingRewards[user];
        uint256 currentAccumulatedRewards = s.accumulatedRewardsPerShare;

        // Calculate additional rewards since last update
        if (block.number > s.lastUpdateBlock && s.totalStaked > 0) {
            uint256 blocksSinceUpdate = block.number - s.lastUpdateBlock;
            uint256 rewardPerBlock = calculateRewardPerBlock();
            uint256 additionalRewards = (rewardPerBlock * blocksSinceUpdate * LibLandBank.PRECISION) / s.totalStaked;
            currentAccumulatedRewards += additionalRewards;
        }

        // Calculate pending rewards for all staked tokens
        uint256 length = userTokens.length();
        for (uint256 i = 0; i < length; i++) {
            uint256 tokenId = userTokens.at(i);
            LibLandBank.Stake storage stake = s.tokenStakes[tokenId];
            if (stake.owner == user) {
                pending += (currentAccumulatedRewards - stake.rewardDebt) / LibLandBank.PRECISION;
            }
        }

        return pending;
    }

    // View function to see how much of the initial 100M reward token is not-yet-minted
    function getRemainingSupply() external view returns (uint256) {
        return LibLandBank.getRemainingSupply();
    }

    // View function to get user's actively staked token IDs
    function getUserStakedTokens(address user) external view returns (uint256[] memory activeTokens) {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        EnumerableSet.UintSet storage userTokens = s.userTokenIds[user];

        uint256 length = userTokens.length();
        activeTokens = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            activeTokens[i] = userTokens.at(i);
        }
    }

    // View function to see the staking reward information of a particular LandPixel
    function getStakeInfo(
        uint256 tokenId
    ) external view returns (address owner, uint256 startBlock, uint256 pendingRewards) {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        LibLandBank.Stake storage stake = s.tokenStakes[tokenId];

        owner = stake.owner;
        startBlock = stake.startBlock;

        uint256 currentAccumulatedRewards = s.accumulatedRewardsPerShare;
        if (block.number > s.lastUpdateBlock && s.totalStaked > 0) {
            uint256 blocksSinceUpdate = block.number - s.lastUpdateBlock;
            uint256 rewardPerBlock = calculateRewardPerBlock();
            uint256 additionalRewards = (rewardPerBlock * blocksSinceUpdate * LibLandBank.PRECISION) / s.totalStaked;
            currentAccumulatedRewards += additionalRewards;
        }

        pendingRewards = _calculateTokenRewards(tokenId, currentAccumulatedRewards);
    }

    // View function to see the total count of staked LandPixels
    function getTotalStaked() external view returns (uint256) {
        return LibLandBank.getStorage().totalStaked;
    }

    // View function to see the total count of staked LandPixels of a single user address
    function getUserTotalStaked(address user) external view returns (uint256) {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        return s.userTokenIds[user].length();
    }
}
