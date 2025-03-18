// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface ILandBank {
    function mintLandPixels(uint256[] memory tokenIds) external payable;
    function buyLandPixels(uint256[] memory tokenIds) external payable;
    function sellLandPixel(uint256 tokenId) external payable;
}

contract MockReentrantAttacker is IERC721Receiver {
    ILandBank public landBank;
    bool public attacking;

    constructor(address _landBank) {
        landBank = ILandBank(_landBank);
    }

    // Function to initiate the attack
    function attack(uint256[] memory tokenIds) external payable {
        require(msg.value > 0, "Need ETH for attack");
        attacking = true;
        landBank.mintLandPixels{value: msg.value}(tokenIds);
    }

    // Fallback function that attempts to reenter the contract
    receive() external payable {
        if (attacking) {
            attacking = false;
            // Attempt to reenter by calling mintLandPixels again with the same value
            uint256[] memory tokenIds = new uint256[](1);
            tokenIds[0] = 3; // Try to mint a different token
            landBank.mintLandPixels{value: address(this).balance}(tokenIds);
        }
    }

    // Implementation of IERC721Receiver
    function onERC721Received(address, address, uint256, bytes calldata) external override returns (bytes4) {
        // This is where we'll attempt the reentrant call
        if (attacking) {
            attacking = false;
            uint256[] memory tokenIds = new uint256[](1);
            tokenIds[0] = 3; // Try to mint a different token
            landBank.mintLandPixels{value: address(this).balance}(tokenIds);
        }
        return IERC721Receiver.onERC721Received.selector;
    }

    // Function to withdraw any ETH in the contract (for testing cleanup)
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
