// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {LibLandBank} from "../libraries/LibLandBank.sol";

contract LandBankAdminFacet is AccessControlInternal {
    using LibLandBank for LibLandBank.LandBankStorage;

    bytes32 constant LANDBANK_ADMIN_ROLE = keccak256("LANDBANK_ADMIN_ROLE");
    bytes32 constant ACCESS_CONTROL_STORAGE_SLOT = keccak256("access_control.storage");
    struct AccessControlStorage {
        mapping(bytes32 => mapping(address => bool)) roles;
        mapping(bytes32 => bytes32) roleAdmin;
    }

    function getAccessControlStorage() internal pure returns (AccessControlStorage storage acs) {
        bytes32 slot = ACCESS_CONTROL_STORAGE_SLOT;
        assembly {
            acs.slot := slot
        }
    }

    bytes32 constant STORAGE_SLOT = keccak256("landbank.storage");

    function getStorage() internal pure returns (LibLandBank.LandBankStorage storage ls) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            ls.slot := slot
        }
    }

    // Events
    event RebuyDelayUpdated(uint256);
    event FeeRateUpdated(uint256);
    event PixelCostUpdated(uint256);
    event MaxDistrictIdUpdated(uint256);
    event AdminTokenWithdrawal(address tokenContract, address recipient, uint amount);
    event AdminWithdrawal(address recipient, uint amount);

    /*******************************************************************************************\
     *  @dev Update feeRate
     *  @param newFeeRate New fee rate charged for LandPixel buybacks
     *  The fee rate is a percentage figure with 2 decimal places (i.e. it is divided by 10000
     *  before being used as a multiplier), so that a feeRate of 321 corresponds to 3.21% fees
     *  Only the admin (owner) can make this update
    \*******************************************************************************************/
    function updateFeeRate(uint256 newFeeRate) external {
        require(_hasRole(LANDBANK_ADMIN_ROLE, msg.sender), "Not LandBank admin");

        LibLandBank.LandBankStorage storage s = getStorage();
        s.feeRate = newFeeRate;
        emit FeeRateUpdated(newFeeRate);
    }

    /*******************************************************************************************\
     *  @dev Update rebuyDelay
     *  @param newRebuyDelay New interval (in seconds) before LandPixel bid offers
     *  After this number of seconds have elapsed since the LandPixel was minted, the automatic
     *  buyback offer from the LandBank (offering the floorPrice for the NFT) will be active
     *  Only the admin (owner) can make this update
    \*******************************************************************************************/
    function updateRebuyDelay(uint256 newRebuyDelay) external {
        require(_hasRole(LANDBANK_ADMIN_ROLE, msg.sender), "Not LandBank admin");

        LibLandBank.LandBankStorage storage s = getStorage();
        s.rebuyDelay = newRebuyDelay;
        emit RebuyDelayUpdated(newRebuyDelay);
    }

    /*******************************************************************************************\
     *  @dev Update base pixel cost
     *  @param newPixelCost New cost (in native token base unit) to mint and claim LandPixels
     *  Only the admin (owner) can make this update
    \*******************************************************************************************/
    function updatePixelCost(uint256 newPixelCost) external {
        require(_hasRole(LANDBANK_ADMIN_ROLE, msg.sender), "Not LandBank admin");

        LibLandBank.LandBankStorage storage s = getStorage();
        s.pixelCost = newPixelCost;
        emit PixelCostUpdated(newPixelCost);
    }

    /*******************************************************************************************\
     *  @dev Update maximum districtId (which restricts which LandPixel NFTs can be minted)
     *  @param newMax New maximum districtId (NFT tokenId)
     *  Only the admin (owner) can make this update
    \*******************************************************************************************/
    function updateMaxDistrictId(uint256 newMax) external {
        require(_hasRole(LANDBANK_ADMIN_ROLE, msg.sender), "Not LandBank admin");

        LibLandBank.LandBankStorage storage s = getStorage();
        s.maxDistrictId = newMax;
        emit MaxDistrictIdUpdated(newMax);
    }

    /*******************************************************************************************\
     *  @dev Withdraw function (for native token)
     *  @param recipient Destination for withdrawal
     *  @param amount Quantity to withdraw
     *  Only the admin (owner) can withdraw
    \*******************************************************************************************/
    function adminWithdraw(address payable recipient, uint amount) external {
        require(_hasRole(LANDBANK_ADMIN_ROLE, msg.sender), "Not LandBank admin");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Admin withdrawal failed");
        emit AdminWithdrawal(recipient, amount);
    }

    /*******************************************************************************************\
     *  @dev Withdraw function (to be able to withdraw miscellaneous tokens sent to LandBank)
     *  @param tokenContract Address of the token contract
     *  @param recipient Address of the token recipient
     *  @param amount Quantity of tokens to withdraw
     *  Only the admin (owner) can withdraw tokens
    \********************************************************/
    function adminWithdrawTokens(address tokenContract, address recipient, uint amount) external {
        require(_hasRole(LANDBANK_ADMIN_ROLE, msg.sender), "Not LandBank admin");

        bool success = IERC20(tokenContract).transfer(recipient, amount);
        require(success, "Token withdrawal failed");
        emit AdminTokenWithdrawal(tokenContract, recipient, amount);
    }
}
