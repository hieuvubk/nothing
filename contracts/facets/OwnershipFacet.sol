// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {LibDiamond} from "../libraries/LibDiamond.sol";
import {IERC173} from "@solidstate/contracts/interfaces/IERC173.sol";
import {ISafeOwnable} from "@solidstate/contracts/access/ownable/ISafeOwnable.sol";

contract OwnershipFacet is IERC173, ISafeOwnable {
    function transferOwnership(address _newOwner) external override {
        LibDiamond.enforceIsContractOwner();
        LibDiamond.setNomineeOwner(_newOwner);
    }

    function owner() external view override returns (address owner_) {
        owner_ = LibDiamond.contractOwner();
    }

    function nomineeOwner() external view override returns (address) {
        return LibDiamond.nomineeOwner();
    }

    function acceptOwnership() external override {
        require(msg.sender == LibDiamond.nomineeOwner(), "OwnershipFacet: caller is not the nominee");
        LibDiamond.setContractOwner(msg.sender);
        LibDiamond.setNomineeOwner(address(0));
    }
}
