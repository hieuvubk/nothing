// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library LibLandBank {
    using EnumerableSet for EnumerableSet.UintSet;

    uint256 public constant PRECISION = 1e18;
    uint256 public constant STAKE_REWARD_BASE_DIVISOR = 100_000_000; // stake rewards are 1/100M remaining supply
    uint256 public constant USER_TOTAL_SUPPLY = 100_000_000 * 1e18; // 100M allocated for LandPixel minting and staking

    bytes32 constant STORAGE_SLOT = keccak256("landbank.storage");

    struct Stake {
        address owner; // Who owns this stake
        uint256 startBlock; // When it was staked
        uint256 rewardDebt; // Last checkpoint for rewards
    }

    struct LandBankStorage {
        address landPixelAddress;
        address dstrxTokenAddress;
        address burnAddress;
        uint256 pixelCost;
        uint256 maxDistrictId;
        uint256 feeRate;
        uint256 rebuyDelay;
        uint256 burnOnMintPercentage;
        mapping(uint256 => uint256) mintTimestamps;
        // Staking-specific state
        mapping(uint256 => Stake) tokenStakes; // tokenId => Stake
        mapping(address => EnumerableSet.UintSet) userTokenIds; // user => their staked tokenIds
        uint256 totalStaked;
        uint256 lastUpdateBlock;
        uint256 accumulatedRewardsPerShare;
        uint256 stakingMintedRewards;
        mapping(address => uint256) userPendingRewards;
    }

    function getStorage() internal pure returns (LandBankStorage storage ls) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            ls.slot := slot
        }
    }

    // View function to see how much of the initial 100M reward token is not-yet-minted
    function getRemainingSupply() internal view returns (uint256) {
        LandBankStorage storage s = getStorage();
        return USER_TOTAL_SUPPLY - s.stakingMintedRewards;
    }

    function updateAccumulatedRewards() internal {
        LandBankStorage storage s = getStorage();

        if (block.number <= s.lastUpdateBlock) return;
        if (s.totalStaked == 0) {
            s.lastUpdateBlock = block.number;
            return;
        }

        uint256 blocksSinceUpdate = block.number - s.lastUpdateBlock;
        uint256 rewardPerBlock = calculateRewardPerBlock();

        uint256 rewardPerBlockScaled = (rewardPerBlock * PRECISION) / s.totalStaked;
        uint256 additionalRewards = rewardPerBlockScaled * blocksSinceUpdate;

        // Check for overflow before adding to accumulatedRewardsPerShare
        if (additionalRewards > type(uint256).max - s.accumulatedRewardsPerShare) {
            revert("Accumulated rewards overflow");
        }

        s.accumulatedRewardsPerShare += additionalRewards;
        s.lastUpdateBlock = block.number;
    }

    function calculateRewardPerBlock() internal view returns (uint256) {
        LandBankStorage storage s = getStorage();

        if (s.totalStaked == 0) return 0;

        uint256 remainingAllocation = USER_TOTAL_SUPPLY - s.stakingMintedRewards;

        // Calculate the reward per block as 1/100M of remaining allocation
        return remainingAllocation / STAKE_REWARD_BASE_DIVISOR;
    }
}
