// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

library LibLandBank {
    using EnumerableSet for EnumerableSet.UintSet;

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
}
