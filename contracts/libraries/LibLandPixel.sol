// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library LibLandPixel {
    bytes32 constant LANDPIXEL_STORAGE_SLOT = keccak256("landpixel.storage");

    struct LandPixelStorage {
        string baseTokenURI;
        address minter;
    }

    function getStorage() internal pure returns (LandPixelStorage storage s) {
        bytes32 position = LANDPIXEL_STORAGE_SLOT;
        assembly {
            s.slot := position
        }
    }
}
