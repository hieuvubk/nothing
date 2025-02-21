// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {Diamond, DiamondArgs} from "../contracts/Diamond.sol"; // Updated this line
import {LandBankDiamondInit} from "../contracts/upgradeInitializers/LandBankDiamondInit.sol";
import {DiamondCutFacet} from "../contracts/facets/DiamondCutFacet.sol";
import {DiamondLoupeFacet} from "../contracts/facets/DiamondLoupeFacet.sol";
import {OwnershipFacet} from "../contracts/facets/OwnershipFacet.sol";
import {LandBankAdminFacet} from "../contracts/facets/LandBankAdminFacet.sol";
import {LandBankMainFacet} from "../contracts/facets/LandBankMainFacet.sol";
import {LandBankStakingFacet} from "../contracts/facets/LandBankStakingFacet.sol";
import {LibLandBank} from "../contracts/libraries/LibLandBank.sol";
import {IDiamond} from "../contracts/interfaces/IDiamond.sol";
import {Test} from "../lib/forge-std/src/Test.sol";
import {LandPixelFacet} from "../contracts/facets/LandPixelFacet.sol";
import {DSTRXToken} from "../contracts/DSTRXToken.sol";
import {IERC173} from "@solidstate/contracts/interfaces/IERC173.sol";
import {console} from "forge-std/console.sol";
import {AccessControlFacet} from "../contracts/facets/AccessControlFacet.sol";

library DiamondHelpers {
    function getSelectors(
        address _facet,
        address diamondCutFacetAddr,
        address diamondLoupeFacetAddr,
        address ownershipFacetAddr,
        address adminFacetAddr,
        address userFacetAddr,
        address accessControlFacetAddr,
        address stakingFacetAddr
    ) internal pure returns (bytes4[] memory) {
        bytes4[] memory selectors;

        if (_facet == diamondCutFacetAddr) {
            selectors = new bytes4[](1);
            selectors[0] = DiamondCutFacet.diamondCut.selector;
        } else if (_facet == diamondLoupeFacetAddr) {
            selectors = new bytes4[](4);
            selectors[0] = DiamondLoupeFacet.facets.selector;
            selectors[1] = DiamondLoupeFacet.facetFunctionSelectors.selector;
            selectors[2] = DiamondLoupeFacet.facetAddresses.selector;
            selectors[3] = DiamondLoupeFacet.facetAddress.selector;
        } else if (_facet == ownershipFacetAddr) {
            selectors = new bytes4[](2);
            selectors[0] = OwnershipFacet.transferOwnership.selector;
            selectors[1] = OwnershipFacet.owner.selector;
        } else if (_facet == adminFacetAddr) {
            selectors = new bytes4[](3);
            selectors[0] = LandBankAdminFacet.updatePixelCost.selector;
            selectors[1] = LandBankAdminFacet.updateMaxDistrictId.selector;
            selectors[2] = LandBankAdminFacet.updateFeeRate.selector;
        } else if (_facet == userFacetAddr) {
            selectors = new bytes4[](11);
            selectors[0] = LandBankMainFacet.mintLandPixels.selector;
            selectors[1] = LandBankMainFacet.getPixelCost.selector;
            selectors[2] = LandBankMainFacet.getMaxDistrictId.selector;
            selectors[3] = LandBankMainFacet.getFeeRate.selector;
            selectors[4] = LandBankMainFacet.getLandPixelAddress.selector;
            selectors[5] = LandBankMainFacet.getDstrxTokenAddress.selector;
            selectors[6] = LandBankMainFacet.buyLandPixels.selector;
            selectors[7] = LandBankMainFacet.sellLandPixel.selector;
            selectors[8] = LandBankMainFacet.floorPrice.selector;
            selectors[9] = LandBankMainFacet.getRebuyDelay.selector;
            selectors[10] = LandBankMainFacet.getCurrentMintReward.selector;
        } else if (_facet == accessControlFacetAddr) {
            selectors = new bytes4[](4);
            selectors[0] = bytes4(keccak256("grantRole(bytes32,address)"));
            selectors[1] = bytes4(keccak256("revokeRole(bytes32,address)"));
            selectors[2] = bytes4(keccak256("hasRole(bytes32,address)"));
            selectors[3] = bytes4(keccak256("getRoleAdmin(bytes32)"));
        } else if (_facet == stakingFacetAddr) {
            selectors = new bytes4[](11);
            selectors[0] = LandBankStakingFacet.calculateRewardPerBlock.selector;
            selectors[1] = LandBankStakingFacet.stakeLandPixel.selector;
            selectors[2] = LandBankStakingFacet.unstakeLandPixel.selector;
            selectors[3] = LandBankStakingFacet.claimRewardForToken.selector;
            selectors[4] = LandBankStakingFacet.claimAllRewards.selector;
            selectors[5] = LandBankStakingFacet.getPendingRewards.selector;
            selectors[6] = LandBankStakingFacet.getUserStakedTokens.selector;
            selectors[7] = LandBankStakingFacet.getStakeInfo.selector;
            selectors[8] = LandBankStakingFacet.getTotalStaked.selector;
            selectors[9] = LandBankStakingFacet.getUserTotalStaked.selector;
            selectors[10] = LandBankStakingFacet.getRemainingSupply.selector;
        } else {
            console.log("No match found for facet");
        }

        return selectors;
    }
}

contract LandBankTest is Test {
    using DiamondHelpers for address;

    // Add facet address storage
    DiamondCutFacet public diamondCutFacet;
    DiamondLoupeFacet public diamondLoupeFacet;
    OwnershipFacet public ownershipFacet;
    LandBankAdminFacet public adminFacet;
    LandBankMainFacet public userFacet;
    AccessControlFacet public accessControlFacet;
    LandBankStakingFacet public stakingFacet;

    LandBankMainFacet public landBank;
    LandBankAdminFacet public landBankAdmin;
    LandPixelFacet public landPixel;
    Diamond public landPixelDiamond;
    LandPixelFacet public landPixelFacet;
    DSTRXToken public dstrxToken;
    address public owner;
    address public user1;
    address public user2;

    uint256 public initialPixelCost = 1.0 ether;
    uint256 public initialMaxDistrictId = 0;
    uint256 public initialFeeRate = 200; // 2.00%

    function setUp() public {
        owner = makeAddr("Owner");
        user1 = makeAddr("User1");
        user2 = makeAddr("User2");

        // Set initial balances for users
        vm.deal(owner, 100 ether);
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);

        vm.startPrank(owner);

        // Deploy tokens first
        dstrxToken = new DSTRXToken(owner);

        // Deploy LandPixel Diamond facets
    DiamondCutFacet landPixelDiamondCutFacet = new DiamondCutFacet();
    DiamondLoupeFacet landPixelDiamondLoupeFacet = new DiamondLoupeFacet();
    OwnershipFacet landPixelOwnershipFacet = new OwnershipFacet();
    landPixelFacet = new LandPixelFacet();

    // Prepare facet cuts for LandPixel
    IDiamond.FacetCut[] memory landPixelCuts = new IDiamond.FacetCut[](4);
    
    // Add DiamondCut facet
    landPixelCuts[0] = IDiamond.FacetCut({
        facetAddress: address(landPixelDiamondCutFacet),
        action: IDiamond.FacetCutAction.Add,
        functionSelectors: address(landPixelDiamondCutFacet).getSelectors(
            address(landPixelDiamondCutFacet),
            address(landPixelDiamondLoupeFacet),
            address(landPixelOwnershipFacet),
            address(0), // adminFacet not needed
            address(0), // userFacet not needed
            address(0), // accessControlFacet not needed
            address(0)  // stakingFacet not needed
        )
    });

    // Add DiamondLoupe facet
    landPixelCuts[1] = IDiamond.FacetCut({
        facetAddress: address(landPixelDiamondLoupeFacet),
        action: IDiamond.FacetCutAction.Add,
        functionSelectors: address(landPixelDiamondLoupeFacet).getSelectors(
            address(landPixelDiamondCutFacet),
            address(landPixelDiamondLoupeFacet),
            address(landPixelOwnershipFacet),
            address(0),
            address(0),
            address(0),
            address(0)
        )
    });

    // Add Ownership facet
    landPixelCuts[2] = IDiamond.FacetCut({
        facetAddress: address(landPixelOwnershipFacet),
        action: IDiamond.FacetCutAction.Add,
        functionSelectors: address(landPixelOwnershipFacet).getSelectors(
            address(landPixelDiamondCutFacet),
            address(landPixelDiamondLoupeFacet),
            address(landPixelOwnershipFacet),
            address(0),
            address(0),
            address(0),
            address(0)
        )
    });

    // Add LandPixel facet
    landPixelCuts[3] = IDiamond.FacetCut({
        facetAddress: address(landPixelFacet),
        action: IDiamond.FacetCutAction.Add,
        functionSelectors: _getLandPixelSelectors()
    });

    // Deploy LandPixel Diamond
    landPixelDiamond = new Diamond(
        landPixelCuts,
        DiamondArgs({
            owner: owner,
            init: address(0),
            initCalldata: ""
        })
    );
        // Use the Diamond proxy address for landPixel
        landPixel = LandPixelFacet(address(landPixelDiamond));

        // Deploy LandBankDiamondInit
        LandBankDiamondInit landBankDiamondInit = new LandBankDiamondInit();

        // Deploy facets
        diamondCutFacet = new DiamondCutFacet();
        diamondLoupeFacet = new DiamondLoupeFacet();
        ownershipFacet = new OwnershipFacet();
        adminFacet = new LandBankAdminFacet();
        userFacet = new LandBankMainFacet();
        accessControlFacet = new AccessControlFacet();
        stakingFacet = new LandBankStakingFacet();

        // Prepare facet cuts
        IDiamond.FacetCut[] memory cuts = new IDiamond.FacetCut[](7);
        cuts[0] = IDiamond.FacetCut({
            facetAddress: address(diamondCutFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(diamondCutFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });
        cuts[1] = IDiamond.FacetCut({
            facetAddress: address(diamondLoupeFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(diamondLoupeFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });
        cuts[2] = IDiamond.FacetCut({
            facetAddress: address(ownershipFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(ownershipFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });
        cuts[3] = IDiamond.FacetCut({
            facetAddress: address(adminFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(adminFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });
        cuts[4] = IDiamond.FacetCut({
            facetAddress: address(userFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(userFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });
        cuts[5] = IDiamond.FacetCut({
            facetAddress: address(accessControlFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(accessControlFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });
        cuts[6] = IDiamond.FacetCut({
            facetAddress: address(stakingFacet),
            action: IDiamond.FacetCutAction.Add,
            functionSelectors: address(stakingFacet).getSelectors(
                address(diamondCutFacet),
                address(diamondLoupeFacet),
                address(ownershipFacet),
                address(adminFacet),
                address(userFacet),
                address(accessControlFacet),
                address(stakingFacet)
            )
        });

        // Prepare initialization call
        bytes memory init = abi.encodeWithSignature(
                "init(address,address)",
                address(landPixel),
                address(dstrxToken)
            );
        // Deploy Diamond
        Diamond diamond = new Diamond(
            cuts,
            DiamondArgs({owner: owner, init: address(landBankDiamondInit), initCalldata: init})
        );

        // Set landBank as the Diamond proxy address with UserFacet interface
        landBank = LandBankMainFacet(payable(address(diamond)));
        landBankAdmin = LandBankAdminFacet(address(diamond));

        // Transfer token ownership to Diamond
        dstrxToken.transferOwnership(address(diamond));
        LandPixelFacet(address(landPixelDiamond)).setMinter(address(diamond));

        vm.stopPrank();
    }

    function testDeployment() public view {
        assertEq(IERC173(address(landBank)).owner(), owner);
        assertTrue(address(landPixel) != address(0));
        assertTrue(address(dstrxToken) != address(0));
        assertEq(landBank.getPixelCost(), initialPixelCost);
        assertEq(landBank.getMaxDistrictId(), initialMaxDistrictId);
        assertEq(landBank.getFeeRate(), initialFeeRate);
    }

    function testMintLandWithSufficientPayment() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        // Create array containing a single tokenId value (1)
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        assertEq(landPixel.ownerOf(1), user1);
        assertEq(dstrxToken.balanceOf(user1), 100 ether);
        vm.stopPrank();
    }

    function _getLandPixelSelectors() internal pure returns (bytes4[] memory) {
        bytes4[] memory selectors = new bytes4[](16);

        // Basic ERC721 functionality
        selectors[0] = LandPixelFacet.supportsInterface.selector;
        selectors[1] = LandPixelFacet.name.selector;
        selectors[2] = LandPixelFacet.symbol.selector;
        selectors[3] = LandPixelFacet.tokenURI.selector;
        selectors[4] = LandPixelFacet.setBaseURI.selector;
        selectors[5] = LandPixelFacet.safeMint.selector;
        selectors[6] = LandPixelFacet.setMinter.selector;
        selectors[7] = LandPixelFacet.getMinter.selector;
        selectors[8] = LandPixelFacet.exists.selector;

        // ERC721 transfer and approval functions
        selectors[9] = bytes4(keccak256("approve(address,uint256)"));
        selectors[10] = bytes4(keccak256("getApproved(uint256)"));
        selectors[11] = bytes4(keccak256("setApprovalForAll(address,bool)"));
        selectors[12] = bytes4(keccak256("isApprovedForAll(address,address)"));
        selectors[13] = bytes4(keccak256("transferFrom(address,address,uint256)"));
        selectors[14] = bytes4(keccak256("ownerOf(uint256)"));
        selectors[15] = bytes4(keccak256("balanceOf(address)"));

        return selectors;
    }

    function testMintLandWithInsufficientPayment() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        // Create array containing a single tokenId value (1)
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        vm.startPrank(user1);
        vm.expectRevert("InsufficientDeposit");
        landBank.mintLandPixels{value: 0.05 ether}(tokenIds);
        vm.stopPrank();
    }

    function testMintLandBeyondMaxDistrictId() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        // Create array containing a single tokenId value (11)
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 11;

        vm.startPrank(user1);
        vm.expectRevert("LandPixelNotAvailable");
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        vm.stopPrank();
    }

    function testFuzzMintLandPixels(uint256[] memory tokenIds) public {
        uint maxDistrictId = 100;
        // Use a bool array to ensure uniqueness of tokenIds
        bool[] memory usedTokenIds = new bool[](maxDistrictId);
        uint256 uniqueCount = 0;

        // Create a new array to store unique tokenIds
        uint256[] memory uniqueTokenIds = new uint256[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i] % maxDistrictId;
            if (!usedTokenIds[tokenId]) {
                usedTokenIds[tokenId] = true;
                uniqueTokenIds[uniqueCount] = tokenId;
                uniqueCount++;
            }
        }

        // Resize the uniqueTokenIds array to the number of unique elements
        assembly {
            mstore(uniqueTokenIds, uniqueCount)
        }

        vm.assume(uniqueCount > 0 && uniqueCount < maxDistrictId);

        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(maxDistrictId);
        vm.stopPrank();

        vm.startPrank(user1);
        uint256 totalCost = initialPixelCost * uniqueCount;
        vm.deal(user1, totalCost);

        if (address(user1).balance >= totalCost) {
            landBank.mintLandPixels{value: totalCost}(uniqueTokenIds);
        } else {
            vm.expectRevert(abi.encodeWithSignature("InsufficientDeposit()"));
            landBank.mintLandPixels{value: totalCost}(uniqueTokenIds);
        }
        vm.stopPrank();
    }

    function testAccessControl() public {
        bytes32 LANDBANK_ADMIN_ROLE = keccak256("LANDBANK_ADMIN_ROLE");

        // Owner should have admin role
        assertTrue(AccessControlFacet(address(landBank)).hasRole(LANDBANK_ADMIN_ROLE, owner));

        // Random user should not have admin role
        assertFalse(AccessControlFacet(address(landBank)).hasRole(LANDBANK_ADMIN_ROLE, user1));

        // Test granting role
        vm.prank(owner);
        AccessControlFacet(address(landBank)).grantRole(LANDBANK_ADMIN_ROLE, user1);
        assertTrue(AccessControlFacet(address(landBank)).hasRole(LANDBANK_ADMIN_ROLE, user1));
    }

    function testStaking() public {
        // Mint a land pixel first
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);

        // Approve staking contract
        landPixel.approve(address(landBank), 1);

        // Stake the pixel
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);

        // Verify pixel ownership
        assertEq(landPixel.ownerOf(1), address(landBank));

        // Verify stake using getStakeInfo
        (address stakeOwner, uint256 startBlock, ) = LandBankStakingFacet(address(landBank)).getStakeInfo(1);
        assertEq(stakeOwner, user1);
        assertEq(startBlock, block.number);

        vm.stopPrank();
    }

    function testUnstaking() public {
        // Set up initial state similar to testStaking
        testStaking();

        vm.startPrank(user1);

        // Unstake the pixel
        LandBankStakingFacet(address(landBank)).unstakeLandPixel(1);

        // Verify unstake
        assertEq(landPixel.ownerOf(1), user1);

        vm.stopPrank();
    }

    function testStakingStorageInitialization() public {
        LibLandBank.LandBankStorage storage s = LibLandBank.getStorage();
        // Try to update storage directly
        vm.startPrank(owner);
        s.lastUpdateBlock = block.number;
        s.totalStaked = 1;
        vm.stopPrank();

        assertTrue(s.lastUpdateBlock > 0, "lastUpdateBlock should be set");
        assertTrue(s.totalStaked > 0, "totalStaked should be set");
    }

    function testRewardCalculation() public {
        // Set up initial stake
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);

        // Approve staking contract
        landPixel.approve(address(landBank), 1);

        // Stake the pixel
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);

        // Get initial block number
        uint256 startBlock = block.number;

        // Move forward some blocks
        uint256 blocksToMove = 100;
        vm.roll(startBlock + blocksToMove);

        // Check pending rewards
        uint256 pendingRewards = LandBankStakingFacet(address(landBank)).getPendingRewards(user1);

        assertGt(pendingRewards, 0, "Should have accumulated rewards");

        vm.stopPrank();
    }

    function testStakingRewardCalculation() public {
        // Setup initial state
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        // User1 mints and stakes a token
        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        landPixel.approve(address(landBank), 1);
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);

        // Advance 100 blocks
        vm.roll(block.number + 100);

        // Check reward calculation
        uint256 rewardPerBlock = LandBankStakingFacet(address(landBank)).calculateRewardPerBlock();
        uint256 pendingRewards = LandBankStakingFacet(address(landBank)).getPendingRewards(user1);

        assertTrue(rewardPerBlock > 0, "Should have non-zero reward per block");
        assertTrue(pendingRewards > 0, "Should have accumulated rewards");

        vm.stopPrank();
    }

    function testMultipleStakersRewardDistribution() public {
        // Setup initial state
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        // Mint tokens for both users
        uint256[] memory tokenIds1 = new uint256[](1);
        tokenIds1[0] = 1;
        uint256[] memory tokenIds2 = new uint256[](1);
        tokenIds2[0] = 2;

        // User1 mints and stakes
        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds1);
        landPixel.approve(address(landBank), 1);
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);
        vm.stopPrank();

        // User2 mints and stakes
        vm.startPrank(user2);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds2);
        landPixel.approve(address(landBank), 2);
        LandBankStakingFacet(address(landBank)).stakeLandPixel(2);
        vm.stopPrank();

        // Advance blocks
        vm.roll(block.number + 100);

        // Check rewards for both users
        uint256 user1Rewards = LandBankStakingFacet(address(landBank)).getPendingRewards(user1);
        uint256 user2Rewards = LandBankStakingFacet(address(landBank)).getPendingRewards(user2);

        // With equal stakes, rewards should be equal
        assertEq(user1Rewards, user2Rewards, "Rewards should be equal for equal stakes");
    }

    function testRewardClaimingAndSupplyLimit() public {
        // Setup initial state
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        // User1 mints and stakes
        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        landPixel.approve(address(landBank), 1);
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);

        // Advance blocks
        vm.roll(block.number + 100);

        // Get initial DSTRX balance
        uint256 initialBalance = dstrxToken.balanceOf(user1);

        // Claim rewards for specific token
        LandBankStakingFacet(address(landBank)).claimRewardForToken(1);

        // Verify reward receipt
        uint256 newBalance = dstrxToken.balanceOf(user1);
        assertTrue(newBalance > initialBalance, "Should have received rewards");

        // Check remaining supply
        uint256 remainingSupply = stakingFacet.getRemainingSupply();
        assertTrue(remainingSupply <= stakingFacet.USER_TOTAL_SUPPLY(), "Should not exceed total supply");

        vm.stopPrank();
    }

    function testStakingStorageConsistency() public {
        // Setup initial state
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        // User1 mints and stakes
        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        landPixel.approve(address(landBank), 1);

        // Check initial state
        uint256 initialStaked = LandBankStakingFacet(address(landBank)).getTotalStaked();
        uint256 initialUserStaked = LandBankStakingFacet(address(landBank)).getUserTotalStaked(user1);

        // Stake token
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);

        // Verify storage updates
        assertEq(LandBankStakingFacet(address(landBank)).getTotalStaked(), initialStaked + 1, "Total staked should increase");
        assertEq(LandBankStakingFacet(address(landBank)).getUserTotalStaked(user1), initialUserStaked + 1, "User staked should increase");

        // Get staked tokens
        uint256[] memory stakedTokens = LandBankStakingFacet(address(landBank)).getUserStakedTokens(user1);
        assertEq(stakedTokens.length, 1, "Should have one staked token");
        assertEq(stakedTokens[0], 1, "Should be token ID 1");

        vm.stopPrank();
    }

    function testFailStakingEdgeCases() public {
        // Setup initial state
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        // Try to stake non-existent token
        vm.startPrank(user1);
        vm.expectRevert("ERC721: invalid token ID");
        LandBankStakingFacet(address(landBank)).stakeLandPixel(999);

        // Mint but don't approve
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        vm.expectRevert("ERC721: caller is not token owner or approved");
        LandBankStakingFacet(address(landBank)).stakeLandPixel(1);

        // Try to claim rewards without staking
        vm.expectRevert("Not stake owner");
        LandBankStakingFacet(address(landBank)).claimRewardForToken(1);

        vm.stopPrank();
    }

    function testMintLandPixelsWithDuplicateTokenIds() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = 1;
        tokenIds[1] = 1; // Duplicate tokenId

        vm.startPrank(user1);
        vm.expectRevert("LandPixelNotAvailable");
        landBank.mintLandPixels{value: initialPixelCost * 2}(tokenIds);
        vm.stopPrank();
    }

    function testMintLandPixelsWithExcessPayment() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;
        uint256 excessPayment = initialPixelCost * 2; // Sending twice the required amount

        uint256 initialBalance = user1.balance;

        vm.startPrank(user1);
        landBank.mintLandPixels{value: excessPayment}(tokenIds);

        // Verify excess payment was refunded
        assertEq(user1.balance, initialBalance - initialPixelCost);
        assertEq(landPixel.ownerOf(1), user1);
        vm.stopPrank();
    }

    function testMintLandPixelsWithMultipleTokens() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](3);
        tokenIds[0] = 1;
        tokenIds[1] = 2;
        tokenIds[2] = 3;
        uint256 totalCost = initialPixelCost * 3;

        vm.startPrank(user1);
        landBank.mintLandPixels{value: totalCost}(tokenIds);

        // Verify all tokens were minted
        assertEq(landPixel.ownerOf(1), user1);
        assertEq(landPixel.ownerOf(2), user1);
        assertEq(landPixel.ownerOf(3), user1);

        // Verify DSTRX tokens were minted correctly
        assertEq(dstrxToken.balanceOf(user1), 300 ether); // 100 ether per token
        vm.stopPrank();
    }

    function testGettersAndSetters() public view {
        // Test initial values
        assertEq(landBank.getPixelCost(), initialPixelCost);
        assertEq(landBank.getMaxDistrictId(), initialMaxDistrictId);
        assertEq(landBank.getFeeRate(), initialFeeRate);

        // Test addresses
        assertEq(landBank.getLandPixelAddress(), address(landPixel));
        assertEq(landBank.getDstrxTokenAddress(), address(dstrxToken));
    }

    function testMintLandPixelsWithInvalidPaymentAmount() public {
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](2);
        tokenIds[0] = 1;
        tokenIds[1] = 2;

        // Sending payment for only one token when trying to mint two
        vm.startPrank(user1);
        vm.expectRevert("InsufficientDeposit");
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        vm.stopPrank();
    }

    function testAdminFacetUpdateFeeRate() public {
        uint256 newFeeRate = 500; // 5.00%

        // Non-admin should fail
        vm.startPrank(user1);
        vm.expectRevert("Not LandBank admin");
        landBankAdmin.updateFeeRate(newFeeRate);
        vm.stopPrank();

        // Admin should succeed
        vm.startPrank(owner);
        landBankAdmin.updateFeeRate(newFeeRate);
        assertEq(landBank.getFeeRate(), newFeeRate);
        vm.stopPrank();
    }

    function testAdminFacetUpdatePixelCost() public {
        uint256 newPixelCost = 2 ether;

        // Non-admin should fail
        vm.startPrank(user1);
        vm.expectRevert("Not LandBank admin");
        landBankAdmin.updatePixelCost(newPixelCost);
        vm.stopPrank();

        // Admin should succeed
        vm.startPrank(owner);
        landBankAdmin.updatePixelCost(newPixelCost);
        assertEq(landBank.getPixelCost(), newPixelCost);
        vm.stopPrank();
    }

    function testAdminFacetUpdateMaxDistrictId() public {
        uint256 newMaxDistrictId = 20;

        // Non-admin should fail
        vm.startPrank(user1);
        vm.expectRevert("Not LandBank admin");
        landBankAdmin.updateMaxDistrictId(newMaxDistrictId);
        vm.stopPrank();

        // Admin should succeed
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(newMaxDistrictId);
        assertEq(landBank.getMaxDistrictId(), newMaxDistrictId);
        vm.stopPrank();
    }

    function testSellLandPixelBeforeRebuyDelay() public {
        // First mint a pixel
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);
        landPixel.approve(address(landBank), 1);

        // Try to sell immediately
        vm.expectRevert("RebuyDelayNotElapsed");
        landBank.sellLandPixel(1);
        vm.stopPrank();
    }

    function testSellLandPixelNotOwner() public {
        // First mint a pixel to user1
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = 1;

        vm.prank(user1);
        landBank.mintLandPixels{value: initialPixelCost}(tokenIds);

        // Try to sell from user2
        vm.startPrank(user2);
        vm.expectRevert("NotLandPixelOwner");
        landBank.sellLandPixel(1);
        vm.stopPrank();
    }


    function testReceiveFunction() public {
        // Send ETH directly to the contract
        vm.deal(user1, 1 ether);

        vm.startPrank(user1);
        (bool success,) = address(landBank).call{value: 1 ether}("");
        assertTrue(success, "Direct ETH transfer should succeed");
        assertEq(address(landBank).balance, 1 ether);
        vm.stopPrank();
    }

    function testGetCurrentMintReward() public {
        uint256 initialReward = landBank.getCurrentMintReward();
        assertTrue(initialReward > 0, "Initial mint reward should be non-zero");

        // Mint some pixels to reduce remaining supply
        vm.startPrank(owner);
        landBankAdmin.updateMaxDistrictId(10);
        vm.stopPrank();

        uint256[] memory tokenIds = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            tokenIds[i] = i + 1;
        }

        vm.startPrank(user1);
        landBank.mintLandPixels{value: initialPixelCost * 5}(tokenIds);

        uint256 newReward = landBank.getCurrentMintReward();
        assertTrue(newReward < initialReward, "Mint reward should decrease after minting");
        vm.stopPrank();
    }
}
