// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AccessControl} from "@solidstate/contracts/access/access_control/AccessControl.sol";

contract AccessControlFacet is AccessControl {
    bytes32 constant LANDBANK_ADMIN_ROLE = keccak256("LANDBANK_ADMIN_ROLE");
}
