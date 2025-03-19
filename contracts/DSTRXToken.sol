// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract DSTRXToken is ERC20, ERC20Burnable, AccessControl, ERC20Permit, ERC20Votes {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 public dailyMintCap = 120_000_000 * 10 ** 18; // 120M tokens with 18 decimals
    uint256 public lastMintTimestamp;
    uint256 public mintedToday;

    // Variables for delayed daily mint cap updates
    uint256 public pendingDailyMintCap;
    uint256 public dailyMintCapUpdateTimestamp;

    event DailyCapUpdated(uint256);

    constructor(address initialOwner) ERC20("Districts Token", "DSTRX") ERC20Permit("DSTRXToken") {
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);
        _mint(initialOwner, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        // Apply the new daily cap if 24 hours have passed
        if (pendingDailyMintCap > 0 && block.timestamp >= dailyMintCapUpdateTimestamp + 1 days) {
            dailyMintCap = pendingDailyMintCap;
            pendingDailyMintCap = 0; // Clear the pending update
        }

        if (block.timestamp >= _nextResetTime()) {
            mintedToday = 0;
            lastMintTimestamp = block.timestamp;
        }

        require(mintedToday + amount <= dailyMintCap, "Exceeds daily cap");

        mintedToday += amount;
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }

    function updateDailyMintCap(uint256 newCap) external onlyRole(DEFAULT_ADMIN_ROLE) {
        pendingDailyMintCap = newCap;
        dailyMintCapUpdateTimestamp = block.timestamp;
        emit DailyCapUpdated(pendingDailyMintCap);
    }

    // Helper function to calculate the next daily cap reset time
    function _nextResetTime() private view returns (uint256) {
        return (lastMintTimestamp / 1 days + 1) * 1 days;
    }

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value) internal override(ERC20, ERC20Votes) {
        super._update(from, to, value);
    }

    function nonces(address owner) public view override(ERC20Permit, Nonces) returns (uint256) {
        return super.nonces(owner);
    }
}
