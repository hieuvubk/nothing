// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721Base} from "@solidstate/contracts/token/ERC721/base/ERC721Base.sol";
import {ERC721BaseInternal} from "@solidstate/contracts/token/ERC721/base/ERC721BaseInternal.sol";
import {ERC721Enumerable} from "@solidstate/contracts/token/ERC721/enumerable/ERC721Enumerable.sol";
import {IERC721Enumerable} from "@solidstate/contracts/token/ERC721/enumerable/IERC721Enumerable.sol";
import {ERC721Metadata} from "@solidstate/contracts/token/ERC721/metadata/ERC721Metadata.sol";
import {IERC721Metadata} from "@solidstate/contracts/token/ERC721/metadata/IERC721Metadata.sol";
import {LibDiamond} from "../libraries/LibDiamond.sol";
import {LibLandPixel} from "../libraries/LibLandPixel.sol";
import {IERC165} from "@solidstate/contracts/interfaces/IERC165.sol";

contract LandPixelFacet is ERC721Base, ERC721Enumerable, ERC721Metadata {
    using LibLandPixel for LibLandPixel.LandPixelStorage;

    error TokenAlreadyMinted();
    error TokenDoesNotExist();

    event MinterSet(address indexed previousMinter, address indexed newMinter);

    // Add this modifier
    modifier onlyMinter() {
        LibLandPixel.LandPixelStorage storage s = LibLandPixel.getStorage();
        require(msg.sender == s.minter, "LandPixelFacet: caller is not the minter");
        _;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IERC721Metadata).interfaceId ||
            interfaceId == type(IERC721Enumerable).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }

    function name() public pure override(ERC721Metadata) returns (string memory) {
        return "LandPixel";
    }

    function symbol() public pure override(ERC721Metadata) returns (string memory) {
        return "LPXL";
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (!_exists(tokenId)) revert TokenDoesNotExist();

        LibLandPixel.LandPixelStorage storage s = LibLandPixel.getStorage();
        return string(abi.encodePacked(s.baseTokenURI, _toString(tokenId)));
    }

    function setBaseURI(string memory newBaseURI) external {
        LibDiamond.enforceIsContractOwner();
        LibLandPixel.LandPixelStorage storage s = LibLandPixel.getStorage();
        s.baseTokenURI = newBaseURI;
    }

    function safeMint(address to, uint256 tokenId) external onlyMinter {
        if (_exists(tokenId)) revert TokenAlreadyMinted();
        _safeMint(to, tokenId);
    }

    function exists(uint256 tokenId) external view returns (bool) {
        return _exists(tokenId);
    }

    // Set the minter (restricted to Diamond owner)
    function setMinter(address _minter) external {
        LibDiamond.enforceIsContractOwner();
        require(_minter != address(0), "LandPixelFacet: new minter is the zero address");

        LibLandPixel.LandPixelStorage storage s = LibLandPixel.getStorage();
        address oldMinter = s.minter;
        s.minter = _minter;
        emit MinterSet(oldMinter, _minter);
    }

    function getMinter() external view returns (address) {
        LibLandPixel.LandPixelStorage storage s = LibLandPixel.getStorage();
        return s.minter;
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @dev Hook that is called before any token transfer
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721BaseInternal, ERC721Metadata) {
        ERC721Metadata._beforeTokenTransfer(from, to, tokenId);
    }
}
