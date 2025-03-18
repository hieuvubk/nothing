// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721Base} from "@solidstate/contracts/token/ERC721/base/IERC721Base.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@solidstate/contracts/security/reentrancy_guard/ReentrancyGuard.sol";
import {LibLandBank} from "../libraries/LibLandBank.sol";

interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

interface IERC721LandPixel is IERC721Base {
    function exists(uint256 tokenId) external view returns (bool);
    function safeMint(address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external payable;
    function ownerOf(uint256 tokenId) external view returns (address);
    function balanceOf(address owner) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function tokenByIndex(uint256 index) external view returns (uint256);
}

contract LandBankMainFacet is ReentrancyGuard {
    using LibLandBank for LibLandBank.LandBankStorage;

    function getStorage() internal pure returns (LibLandBank.LandBankStorage storage) {
        return LibLandBank.getStorage();
    }

    event LandPixelMinted(address, uint256);
    event LandPixelBought(address, uint256);
    event LandPixelSold(address, uint256);
    event LandPixelStaked(address, uint256);
    event LandPixelUnstaked(address, uint256);
    event StakingRewardMinted(address, uint256);
    event Burn(uint amount);
    event Deposit(address sender, uint amount);
    event Withdrawal(address recipient, uint amount);

    uint256 constant USER_TOTAL_SUPPLY = 100_000_000 * 1e18; // 100M DSTRX tokens with 18 decimals
    uint256 constant BANK_TOTAL_SUPPLY = 20_000_000 * 1e18; // 20M DSTRX tokens with 18 decimals
    uint256 constant INITIAL_USER_MINT = 100 * 1e18; // 100 DSTRX tokens initial mint size

    /*******************************************************************************************\
     *  @dev mintLandPixels: function to mint one or more LandPixels in a single call
     *  @param tokenIds the District IDs of the LandPixels being minted and claimed
     *  All tokenIds must be Districts available for claiming (i.e. tokenId < maxDistrictId)
     *  and not already owned by someone. The caller must also include `value` >= the total
     *  combined pixelCost (any value sent in excess of this is automatically refunded)
     *  DSTRX tokens are minted (0.0001% of the remaining not-yet-minted supply is rewarded to
     *  the claimer and 0.00002% goes to the LandBank per LandPixel) on success
     *  This emits {LandPixelMinted} events per LandPixel; mintings emit {Transfer} events
    \*******************************************************************************************/
    function mintLandPixels(uint256[] memory tokenIds) external payable nonReentrant {
        LibLandBank.LandBankStorage storage s = getStorage();
        uint256 totalCost = s.pixelCost * tokenIds.length;

        if (msg.value < totalCost) {
            revert("InsufficientDeposit");
        }

        uint256 pixelCount = tokenIds.length;
        uint256 userMintAmount = 0;
        uint256 bankMintAmount = 0;

        // Update accumulated rewards before modifying stakingMintedRewards
        LibLandBank.updateAccumulatedRewards();

        // Calculate rewards only if there's remaining allocation
        if (s.stakingMintedRewards < USER_TOTAL_SUPPLY) {
            // Use stakingMintedRewards to track user-minted portion
            uint256 userMinted = s.stakingMintedRewards;
            uint256 userRemaining = USER_TOTAL_SUPPLY - userMinted;

            // Calculate user mint amount (decreasing based on remaining supply)
            userMintAmount = (pixelCount * INITIAL_USER_MINT * userRemaining) / USER_TOTAL_SUPPLY;

            // Calculate proportional bank mint amount
            bankMintAmount = (userMintAmount * BANK_TOTAL_SUPPLY) / USER_TOTAL_SUPPLY;

            // Cap the mint amount to remaining supply if needed
            if (s.stakingMintedRewards + userMintAmount > USER_TOTAL_SUPPLY) {
                userMintAmount = USER_TOTAL_SUPPLY - s.stakingMintedRewards;
                bankMintAmount = (userMintAmount * BANK_TOTAL_SUPPLY) / USER_TOTAL_SUPPLY;
            }
        }

        // Loop through the tokenIds and mint each LandPixel
        for (uint256 i = 0; i < pixelCount; i++) {
            _mintSingleLandPixel(msg.sender, tokenIds[i]);
        }

        // Mint rewards only if there are any to distribute
        if (userMintAmount > 0) {
            IMintableERC20(s.dstrxTokenAddress).mint(msg.sender, userMintAmount);
            IMintableERC20(s.dstrxTokenAddress).mint(address(this), bankMintAmount);
            s.stakingMintedRewards += userMintAmount;
        }

        // Refund excess payment
        if (msg.value > totalCost) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(success, "Refund failed");
        }

        emit Deposit(msg.sender, totalCost);

        // Note that burnOnMintPercentage is a uint representing a 2-decimal-place percentage
        // This means we must divide by 100 for the decimal shift, then divide by 100 (again)
        // for calculating percentage of burnAmount; thus denominator = 100 * 100 = 10000
        // Avoid division before multiplication to preserve precision
        uint256 burnAmount = (s.burnOnMintPercentage * totalCost) / 10000;

        // Burn the percentage of the deposit by sending native tokens to the burn address
        (bool burnSuccess, ) = payable(s.burnAddress).call{value: burnAmount}("");
        require(burnSuccess, "Burn transfer failed");

        emit Burn(burnAmount);
    }

    // Private helper function to handle the logic for minting a single LandPixel
    function _mintSingleLandPixel(address minter, uint256 tokenId) private {
        LibLandBank.LandBankStorage storage s = getStorage();

        if (tokenId >= s.maxDistrictId || IERC721LandPixel(s.landPixelAddress).exists(tokenId)) {
            // Use landPixelAddress instead of address(this)
            revert("LandPixelNotAvailable");
        }

        // Call LandPixel's safeMint
        IERC721LandPixel(address(s.landPixelAddress)).safeMint(minter, tokenId);

        s.mintTimestamps[tokenId] = block.timestamp;

        emit LandPixelMinted(minter, tokenId);
    }

    /*******************************************************************************************\
     *  @dev buyLandPixels: function to buy one or more LandPixels from the bank in one call
     *  @param tokenIds the District IDs of the LandPixels being bought
     *  All tokenIds must be Districts owned by the LandBank. The caller must also
     *  include `value` >= the total combined pixelCost (any value sent in excess of this is
     *  automatically refunded). No DSTRX tokens are minted in this process.
     *  This emits {LandPixelBought} event per LandPixel as well as {Transfer} events
    \*******************************************************************************************/
    function buyLandPixels(uint256[] memory tokenIds) external payable nonReentrant {
        LibLandBank.LandBankStorage storage s = getStorage();

        // Calculate total buying cost required
        uint256 totalCost = s.pixelCost * tokenIds.length;

        // Check that the total included deposit is large enough to cover all land buys
        if (msg.value < totalCost) {
            revert("InsufficientDeposit");
        }

        // Loop through the tokenIds and transfer each LandPixel
        for (uint256 i = 0; i < tokenIds.length; i++) {
            // Ensure the LandPixel is owned by the LandBank
            if (IERC721LandPixel(s.landPixelAddress).ownerOf(tokenIds[i]) != address(this)) {
                revert("LandPixelNotAvailable");
            }

            // Ensure the LandPixel is not currently being staked
            if (s.tokenStakes[tokenIds[i]].owner != address(0)) {
                revert("LandPixelAlreadyStaked");
            }

            // Transfer the LandPixel from the LandBank to the buyer
            IERC721LandPixel(s.landPixelAddress).transferFrom(address(this), msg.sender, tokenIds[i]);

            emit LandPixelBought(msg.sender, tokenIds[i]);
        }

        // If the user sent more payment than required, refund the excess
        if (msg.value > totalCost) {
            (bool success, ) = payable(msg.sender).call{value: msg.value - totalCost}("");
            require(success, "Refund failed");
        }

        emit Deposit(msg.sender, totalCost);
    }

    /*******************************************************************************************\
     *  @dev sellLandPixel: function to sell a LandPixel to the LandBank at the floor price
     *  @param tokenId the District ID of the LandPixel being sold back to the LankBank
     *  The tokenId must be a District NFT owned by the calling user, they must have
     *  approved the LandBank to transfer the LandPixel (for the transferFrom to succeed),
     *  and rebuyDelay seconds must have elapsed since the LandPixel was first minted.
     *  This emits a {LandPixelSold} event and a {Withdrawal} event
    \*******************************************************************************************/
    function sellLandPixel(uint256 tokenId) external payable nonReentrant {
        LibLandBank.LandBankStorage storage s = getStorage();

        // Ensure that the caller is the owner of the token
        if (IERC721LandPixel(s.landPixelAddress).ownerOf(tokenId) != msg.sender) {
            revert("NotLandPixelOwner");
        }

        // Ensure that at least rebuyDelay seconds have passed since minting
        if (block.timestamp < s.mintTimestamps[tokenId] + s.rebuyDelay) {
            revert("RebuyDelayNotElapsed");
        }

        // Calculate proportional amount due for LandPixel (minus fee)
        uint256 amount = floorPrice();

        // Transfer the LandPixel to the LandBank
        IERC721LandPixel(s.landPixelAddress).transferFrom(msg.sender, address(this), tokenId);

        // Transfer the funds owed to the user using call
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Payment transfer failed");

        emit Withdrawal(msg.sender, amount);
        emit LandPixelSold(msg.sender, tokenId);
    }

    /*******************************************************************************************\
     *  @dev floorPrice: the price at which the LandBank will buy back LandPixels
     *  The floorPrice automatically subtracts the feeRate % from the offer
    \*******************************************************************************************/
    function floorPrice() public view returns (uint256) {
        LibLandBank.LandBankStorage storage s = getStorage();

        // The LandPixels that the LandBank is the owner of should not be counted towards
        // circulatingSupply, but note that the LandBank doesn't technically own LandPixels
        // which are currently staked in it, which are omitted from the LandBank balance
        uint256 circulatingSupply = IERC721LandPixel(s.landPixelAddress).totalSupply() -
            (IERC721LandPixel(s.landPixelAddress).balanceOf(address(this)) - s.totalStaked);
        if (circulatingSupply <= 0) {
            return 0;
        }

        // Get raw contract balance before subtracting any fee
        uint256 totalAmount = address(this).balance;

        // Calculate the floor price after dividing totalAmount by totalSupply
        uint256 pricePerLandPixel = totalAmount / circulatingSupply;

        // Note that feeRate is a uint representing a 2-decimal-place percentage
        // This means we must divide by 100 for the decimal shift, then divide by 100 (again)
        // for calculating percentage of totalAmount; thus denominator = 100 * 100 = 10000
        // Avoid division before multiplication to preserve precision
        uint256 fee = (pricePerLandPixel * s.feeRate) / 10000;

        // Return the price per NFT minus the fee.
        return pricePerLandPixel - fee;
    }

    /*******************************************************************************************\
     *  @dev Basic (native token) receive function
     *  This function allows the LandBank to receive funds (without data), so that external
     *  payers (e.g. Marketplace contracts) can send to it, which will increase the LandBank's
     *  treasury balance (and thus also increase the floorPrice)
    \*******************************************************************************************/
    receive() external payable {
        emit Deposit(msg.sender, msg.value);
    }

    function getPixelCost() external view returns (uint256) {
        return getStorage().pixelCost;
    }

    function getMaxDistrictId() external view returns (uint256) {
        return getStorage().maxDistrictId;
    }

    function getFeeRate() external view returns (uint256) {
        return getStorage().feeRate;
    }

    function getRebuyDelay() external view returns (uint256) {
        return getStorage().rebuyDelay;
    }

    function getCurrentMintReward() external view returns (uint256) {
        LibLandBank.LandBankStorage storage s = getStorage();

        // Get remaining user supply
        uint256 userRemaining = USER_TOTAL_SUPPLY - s.stakingMintedRewards;

        // Calculate current mint reward for a single pixel (same formula as in mintLandPixels)
        return (INITIAL_USER_MINT * userRemaining) / USER_TOTAL_SUPPLY;
    }

    function getLandPixelAddress() external view returns (address) {
        return getStorage().landPixelAddress;
    }

    function getDstrxTokenAddress() external view returns (address) {
        return getStorage().dstrxTokenAddress;
    }

    function getBurnOnMintPercentage() external view returns (uint256) {
        return getStorage().burnOnMintPercentage;
    }
}
