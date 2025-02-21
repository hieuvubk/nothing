// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILandBank {
    function mintLandPixels(uint256[] memory tokenIds) external payable;
    function buyLandPixels(uint256[] memory tokenIds) external payable;
    function sellLandPixel(uint256 tokenId) external payable;
}

contract MockReentrantAttacker {
    ILandBank public landBank;
    uint256[] public tokenIds;

    constructor(address _landBank) {
        landBank = ILandBank(_landBank);
    }

    // Fallback function that attempts to reenter
    receive() external payable {
        if (address(landBank).balance >= msg.value) {
            landBank.mintLandPixels(tokenIds);
        }
    }

    function attack(uint256[] memory _tokenIds) external payable {
        tokenIds = _tokenIds;
        landBank.mintLandPixels{value: msg.value}(_tokenIds);
    }
}
