// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IDiamondLoupe} from "../interfaces/IDiamondLoupe.sol";
import {IDiamondCut} from "../interfaces/IDiamondCut.sol";
import {IERC173} from "@solidstate/contracts/interfaces/IERC173.sol";
import {IERC165} from "@solidstate/contracts/interfaces/IERC165.sol";
import {IAccessControl} from "@solidstate/contracts/access/access_control/IAccessControl.sol";
import {LandBankMainFacet} from "../facets/LandBankMainFacet.sol";
import {LibLandBank} from "../libraries/LibLandBank.sol";
import {LibLandPixel} from "../libraries/LibLandPixel.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";

contract LandBankDiamondInit is AccessControlInternal {
    bytes32 constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 constant LANDBANK_ADMIN_ROLE = keccak256("LANDBANK_ADMIN_ROLE");

    // custom state variables
    function init(address _landPixelAddress, address _dstrxTokenAddress) external {
        // adding ERC165 data
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;
        ds.supportedInterfaces[type(IAccessControl).interfaceId] = true;

        // Initialize ownership
        LibDiamond.setContractOwner(msg.sender);

        // Initialize access control
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // Grant DEFAULT_ADMIN_ROLE
        _grantRole(LANDBANK_ADMIN_ROLE, msg.sender); // Grant LANDBANK_ADMIN_ROLE

        // EIP-2535 specifies that the `diamondCut` function takes two optional
        // arguments: address _init and bytes calldata _calldata
        // These arguments are used to execute an arbitrary function using delegatecall
        // in order to set state variables in the diamond during deployment or an upgrade
        // More info here: https://eips.ethereum.org/EIPS/eip-2535#diamond-interface

        LibLandBank.LandBankStorage storage ls = LibLandBank.getStorage();
        // Initialize other storage variables with their default values
        ls.landPixelAddress = _landPixelAddress;
        ls.dstrxTokenAddress = _dstrxTokenAddress;
        ls.pixelCost = 1 ether;
        ls.feeRate = 200; // 2.00% fee
        ls.rebuyDelay = 604800; // 7 days denominated in seconds
        ls.maxDistrictId = 0;
        ls.burnOnMintPercentage = 2000; // 20% of RIO burnt per mint
        ls.burnAddress = 0x000000000000000000000000000000000000dEaD;
        ls.totalStaked = 0;
        ls.lastUpdateBlock = block.number;
        ls.accumulatedRewardsPerShare = 0;
        ls.stakingMintedRewards = 0;
    }
}
