// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IDiamondLoupe} from "../interfaces/IDiamondLoupe.sol";
import {IDiamondCut} from "../interfaces/IDiamondCut.sol";
import {IERC173} from "@solidstate/contracts/interfaces/IERC173.sol";
import {IERC165} from "@solidstate/contracts/interfaces/IERC165.sol";
import {LandPixelFacet} from "../facets/LandPixelFacet.sol";
import {LibLandPixel} from "../libraries/LibLandPixel.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";

contract LandPixelDiamondInit {
    bytes32 constant OWNABLE_STORAGE_SLOT = keccak256("ownable.storage");

    struct OwnableStorage {
        address owner;
    }

    function getOwnableStorage() internal pure returns (OwnableStorage storage os) {
        bytes32 slot = OWNABLE_STORAGE_SLOT;
        assembly {
            os.slot := slot
        }
    }
    // custom state variables
    function init() external {
        // adding ERC165 data
        LibDiamond.DiamondStorage storage ds = LibDiamond.diamondStorage();
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondCut).interfaceId] = true;
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC173).interfaceId] = true;

        // Initialize ownership
        OwnableStorage storage os = getOwnableStorage();
        os.owner = msg.sender;

        // EIP-2535 specifies that the `diamondCut` function takes two optional
        // arguments: address _init and bytes calldata _calldata
        // These arguments are used to execute an arbitrary function using delegatecall
        // in order to set state variables in the diamond during deployment or an upgrade
        // More info here: https://eips.ethereum.org/EIPS/eip-2535#diamond-interface

        LibLandPixel.LandPixelStorage storage lps = LibLandPixel.getStorage();
        lps.baseTokenURI = "https://districts.xyz/landpixel/";
    }
}
