import hre from "hardhat";
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { getSelectors } from "./util/getSelectors";

const ONE_WEEK_PLUS_ONE_SECOND = 86400 * 7 + 1;

describe("LandBank", function () {
  beforeEach(async function () {
    const signers = await hre.ethers.getSigners();
    this.owner = signers[0];
    this.user1 = signers[1];
    this.user2 = signers[2];

    // Deploy LandPixel Diamond first
    // Deploy DiamondCutFacet
    const DiamondCutFacet =
      await hre.ethers.getContractFactory("DiamondCutFacet");
    const diamondCutFacet = await DiamondCutFacet.deploy();
    await diamondCutFacet.waitForDeployment();

    // Get selectors for DiamondCutFacet
    const diamondCutSelectors = getSelectors(DiamondCutFacet);

    // Create cut for DiamondCutFacet
    const diamondCutFacetCut = {
      facetAddress: await diamondCutFacet.getAddress(),
      action: 0, // Add
      functionSelectors: diamondCutSelectors,
    };

    // Deploy LandPixelDiamondInit
    const LandPixelDiamondInit = await hre.ethers.getContractFactory(
      "LandPixelDiamondInit",
    );
    const landPixelDiamondInit = await LandPixelDiamondInit.deploy();
    await landPixelDiamondInit.waitForDeployment();

    // Create initialization function call
    const landPixelFunctionCall =
      landPixelDiamondInit.interface.encodeFunctionData("init");

    // Deploy LandPixel Diamond
    const Diamond = await hre.ethers.getContractFactory("Diamond");
    const landPixelFacetCuts = [diamondCutFacetCut];
    const landPixelDiamondArgs = {
      owner: this.owner.address,
      init: await landPixelDiamondInit.getAddress(),
      initCalldata: landPixelFunctionCall,
    };
    this.landPixelDiamond = await Diamond.deploy(
      landPixelFacetCuts,
      landPixelDiamondArgs,
    );
    await this.landPixelDiamond.waitForDeployment();

    // Deploy and add remaining LandPixel facets
    const facetNames = [
      "DiamondLoupeFacet",
      "OwnershipFacet",
      "LandPixelFacet",
    ];
    const landPixelCuts = [];

    for (const facetName of facetNames) {
      const Facet = await hre.ethers.getContractFactory(facetName);
      const facet = await Facet.deploy();
      await facet.waitForDeployment();
      const facetContract = await ethers.getContractAt(
        facetName,
        await facet.getAddress(),
      );

      landPixelCuts.push({
        facetAddress: await facet.getAddress(),
        action: 0, // Add
        functionSelectors: getSelectors(facetContract),
      });
    }

    // Get the diamond cut interface
    const landPixelDiamondCutInterface = await ethers.getContractAt(
      "IDiamondCut",
      await this.landPixelDiamond.getAddress(),
    );

    // Add facets to diamond
    await landPixelDiamondCutInterface.diamondCut(
      landPixelCuts,
      ethers.ZeroAddress,
      "0x",
    );

    // Get interface to LandPixel through LandPixelFacet
    this.landPixel = await ethers.getContractAt(
      "LandPixelFacet",
      await this.landPixelDiamond.getAddress(),
    );

    // Deploy DSTRXToken
    const DSTRXToken = await hre.ethers.getContractFactory("DSTRXToken");
    this.dstrxToken = await DSTRXToken.deploy(this.owner.address);

    // Deploy Diamond
    //const LandBankDiamond = await hre.ethers.getContractFactory("Diamond");
    // this.diamond = await LandBankDiamond.deploy(
    //   this.landPixel.address,
    //   this.dstrxToken.address,
    // );

    // const facetCuts = []; // Empty array for initial deployment
    // const diamondArgs = {
    //   owner: this.owner.address,
    //   init: ethers.ZeroAddress, // No initialization during deployment
    //   initCalldata: "0x",
    // };
    // this.diamond = await LandBankDiamond.deploy(facetCuts, diamondArgs);
    // await this.diamond.waitForDeployment();

    // Deploy LandBankDiamondInit
    const LandBankDiamondInit = await hre.ethers.getContractFactory(
      "LandBankDiamondInit",
    );
    const landBankDiamondInit = await LandBankDiamondInit.deploy();
    await landBankDiamondInit.waitForDeployment();

    // Create initialization function call
    const functionCall = landBankDiamondInit.interface.encodeFunctionData(
      "init",
      [await this.landPixel.getAddress(), await this.dstrxToken.getAddress()],
    );

    // Deploy Diamond with DiamondCutFacet
    const LandBankDiamond = await hre.ethers.getContractFactory("Diamond");
    const facetCuts = [diamondCutFacetCut]; // Include DiamondCutFacet in initial deployment
    const diamondArgs = {
      owner: this.owner.address,
      init: await landBankDiamondInit.getAddress(),
      initCalldata: functionCall,
    };
    this.diamond = await LandBankDiamond.deploy(facetCuts, diamondArgs);
    await this.diamond.waitForDeployment();

    // Get the diamond cut interface
    const diamondCutInterface = await ethers.getContractAt(
      "IDiamondCut",
      await this.diamond.getAddress(),
    );

    // Set up permissions AFTER LandBank diamond is deployed
    // Set LandBank as the authorized minter for LandPixel
    await this.landPixel.setMinter(await this.diamond.getAddress());

    // Transfer ownership of DSTRX token to LandBankDiamond
    await this.dstrxToken.transferOwnership(await this.diamond.getAddress());

    // Deploy Facets
    const LandBankMainFacet =
      await hre.ethers.getContractFactory("LandBankMainFacet");
    const AdminFacet =
      await hre.ethers.getContractFactory("LandBankAdminFacet");
    const LandBankStakingFacet = await hre.ethers.getContractFactory(
      "LandBankStakingFacet",
    );

    this.landBankUserFacet = await LandBankMainFacet.deploy();
    this.adminFacet = await AdminFacet.deploy();
    this.stakingFacet = await LandBankStakingFacet.deploy();

    // Wait for deployments to complete
    await this.landBankUserFacet.waitForDeployment();
    await this.adminFacet.waitForDeployment();
    await this.stakingFacet.waitForDeployment();
    // Get facet cut data
    const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

    // Get selectors directly from the contract factories
    const landBankSelectors = getSelectors(LandBankMainFacet);
    const adminSelectors = getSelectors(AdminFacet);
    const stakingSelectors = getSelectors(LandBankStakingFacet);
    // Get deployed addresses
    const landBankUserFacetAddress = await this.landBankUserFacet.getAddress();
    const adminFacetAddress = await this.adminFacet.getAddress();
    const stakingFacetAddress = await this.stakingFacet.getAddress();
    const landBankUserFacetCut = {
      facetAddress: landBankUserFacetAddress,
      action: FacetCutAction.Add,
      functionSelectors: landBankSelectors,
    };

    const adminFacetCut = {
      facetAddress: adminFacetAddress,
      action: FacetCutAction.Add,
      functionSelectors: adminSelectors,
    };

    const stakingFacetCut = {
      facetAddress: stakingFacetAddress,
      action: FacetCutAction.Add,
      functionSelectors: stakingSelectors,
    };

    // Add facets to diamond
    const diamondAddress = await this.diamond.getAddress();

    const DiamondLoupeFacet =
      await hre.ethers.getContractFactory("DiamondLoupeFacet");
    const diamondLoupeFacet = await DiamondLoupeFacet.deploy();
    await diamondLoupeFacet.waitForDeployment();

    // Get selectors for DiamondLoupeFacet
    const diamondLoupeSelectors = getSelectors(DiamondLoupeFacet);

    // Create cut for DiamondLoupeFacet
    const diamondLoupeFacetCut = {
      facetAddress: await diamondLoupeFacet.getAddress(),
      action: FacetCutAction.Add,
      functionSelectors: diamondLoupeSelectors,
    };

    // Deploy OwnershipFacet
    const OwnershipFacet =
      await hre.ethers.getContractFactory("OwnershipFacet");
    const ownershipFacet = await OwnershipFacet.deploy();
    await ownershipFacet.waitForDeployment();

    // Get selectors for OwnershipFacet
    const ownershipSelectors = getSelectors(OwnershipFacet);

    // Create cut for OwnershipFacet
    const ownershipFacetCut = {
      facetAddress: await ownershipFacet.getAddress(),
      action: FacetCutAction.Add,
      functionSelectors: ownershipSelectors,
    };

    // Add facets to diamond using the correct interface
    await diamondCutInterface.diamondCut(
      [
        landBankUserFacetCut,
        adminFacetCut,
        diamondLoupeFacetCut,
        ownershipFacetCut,
        stakingFacetCut,
      ],
      ethers.ZeroAddress,
      "0x",
    );

    // Get loupe interface
    this.diamondLoupe = await ethers.getContractAt(
      "IDiamondLoupe",
      diamondAddress,
    );

    // Get interface to diamond through LandBankMainFacet
    this.landBank = await hre.ethers.getContractAt(
      "LandBankMainFacet",
      diamondAddress,
    );

    // Get admin interface to diamond through LandBankAdminFacet
    this.landBankAdmin = await hre.ethers.getContractAt(
      "LandBankAdminFacet",
      diamondAddress,
    );

    // Get admin interface to diamond through LandBankAdminFacet
    this.staking = await hre.ethers.getContractAt(
      "LandBankStakingFacet",
      diamondAddress,
    );

    // Connect to LandBank and LandPixel as user1
    this.landBankAsUser1 = this.landBank.connect(this.user1);
    this.landBankAdminAsUser1 = this.landBankAdmin.connect(this.user1);
    this.landPixelAsUser1 = this.landPixel.connect(this.user1);
    this.stakingAsUser1 = this.staking.connect(this.user1);

    // Initial values
    this.initialPixelCost = ethers.parseEther("1.0");
    this.initialMaxDistrictId = 0;
    this.initialFeeRate = 200; // 2.00%
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const ownershipFacet = await ethers.getContractAt(
        "OwnershipFacet",
        await this.diamond.getAddress(),
      );
      expect(await ownershipFacet.owner()).to.equal(this.owner.address);
    });

    it("Should deploy LandPixel and DSTRXToken contracts", async function () {
      expect(await this.landBank.getLandPixelAddress()).to.be.properAddress;
      expect(await this.landBank.getDstrxTokenAddress()).to.be.properAddress;
    });

    it("Should set initial values correctly", async function () {
      expect(await this.landBank.getPixelCost()).to.equal(
        this.initialPixelCost,
      );
      expect(await this.landBank.getMaxDistrictId()).to.equal(
        this.initialMaxDistrictId,
      );
      expect(await this.landBank.getFeeRate()).to.equal(this.initialFeeRate);
    });
  });

  describe("Claiming Land", function () {
    beforeEach(async function () {
      // Set maxDistrictId to allow minting of districts (tokenIds) 0 through 9
      await this.landBankAdmin.updateMaxDistrictId(10);
    });

    it("Should allow minting land with sufficient payment", async function () {
      const tokenId = 1;
      await expect(
        this.landBankAsUser1.mintLandPixels([tokenId], {
          value: this.initialPixelCost,
        }),
      )
        .to.emit(this.landBank, "LandPixelMinted")
        .withArgs(this.user1.address, tokenId);

      expect(await this.landPixel.ownerOf(tokenId)).to.equal(
        this.user1.address,
      );
      expect(await this.dstrxToken.balanceOf(this.user1.address)).to.equal(
        ethers.parseEther("100"),
      );
    });

    it("Should not allow minting land with insufficient payment", async function () {
      await expect(
        this.landBankAsUser1.mintLandPixels([1], {
          value: ethers.parseEther("0.05"),
        }),
      ).to.be.revertedWith("InsufficientDeposit");
    });

    it("Should not allow minting land beyond maxDistrictId", async function () {
      await expect(
        this.landBankAsUser1.mintLandPixels([11], {
          value: this.initialPixelCost,
        }),
      ).to.be.revertedWith("LandPixelNotAvailable");
    });

    it("Should refund excess payment when minting land", async function () {
      const excessPayment = ethers.parseEther("1.2");
      const initialBalance = await ethers.provider.getBalance(
        this.user1.address,
      );

      await this.landBankAsUser1.mintLandPixels([1], { value: excessPayment });

      const finalBalance = await ethers.provider.getBalance(this.user1.address);
      expect(initialBalance - finalBalance).to.be.closeTo(
        this.initialPixelCost,
        ethers.parseEther("0.01"), // Allow for gas costs
      );
    });
  });

  describe("Buying Land from LandBank", function () {
    beforeEach(async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBank.mintLandPixels([1, 2, 3], {
        value: this.initialPixelCost * BigInt(3),
      });
    });

    it("Should allow buying multiple LandPixels from the bank in a single transaction", async function () {
      // Have owner sell LandPixels 1, 2, and 3 back to the bank
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);
      for (let i = 1; i <= 3; i++) {
        await this.landPixel.approve(this.landBank.target, i);
        await this.landBank.sellLandPixel(i);
      }

      await expect(
        this.landBankAsUser1.buyLandPixels([1, 2, 3], {
          value: this.initialPixelCost * BigInt(3),
        }),
      )
        .to.emit(this.landBank, "LandPixelBought")
        .withArgs(this.user1.address, 1)
        .and.to.emit(this.landBank, "LandPixelBought")
        .withArgs(this.user1.address, 2)
        .and.to.emit(this.landBank, "LandPixelBought")
        .withArgs(this.user1.address, 3);

      for (let i = 1; i <= 3; i++) {
        expect(await this.landPixel.ownerOf(i)).to.equal(this.user1.address);
      }
    });
  });

  describe("Selling Land to Bank", function () {
    beforeEach(async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBankAsUser1.mintLandPixels([1], {
        value: this.initialPixelCost,
      });
    });

    it("Should not allow selling land back to the bank before rebuyDelay seconds have elapsed", async function () {
      // Approve the LandBank contract to transfer the user's LandPixel
      await this.landPixelAsUser1.approve(this.landBank.target, 1);

      // Advance time by 1 day (not enough for the default rebuyDelay of 1 week)
      await time.increase(86400);

      await expect(this.landBankAsUser1.sellLandPixel(1)).to.be.revertedWith(
        "RebuyDelayNotElapsed",
      );

      // Verify that the user1 remains the owner of the LandPixel
      expect(await this.landPixel.ownerOf(1)).to.eq(this.user1.address);
    });

    it("Should allow selling land back to the bank after rebuyDelay seconds have elapsed", async function () {
      // Approve the LandBank contract to transfer the user's LandPixel
      await this.landPixelAsUser1.approve(this.landBank.target, 1);

      const initialBalance = await ethers.provider.getBalance(
        this.user1.address,
      );

      // Advance time by 1 week + 1 second
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);

      await expect(this.landBankAsUser1.sellLandPixel(1))
        .to.emit(this.landBank, "LandPixelSold")
        .withArgs(this.user1.address, 1);

      // Verify that the LandBank is now the owner of the LandPixel
      expect(await this.landPixel.ownerOf(1)).to.eq(this.landBank.target);

      // Verify user made some nonzero profit from the sale
      const finalBalance = await ethers.provider.getBalance(this.user1.address);
      expect(finalBalance - initialBalance).to.be.greaterThan(0);
    });

    it("Should not allow selling land not owned by the caller", async function () {
      await expect(
        this.landBank.connect(this.user2).sellLandPixel(1),
      ).to.be.revertedWith("NotLandPixelOwner");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update fee rate", async function () {
      const newFeeRate = 300;
      await expect(this.landBankAdmin.updateFeeRate(newFeeRate))
        .to.emit(this.landBankAdmin, "FeeRateUpdated")
        .withArgs(newFeeRate);

      expect(await this.landBank.getFeeRate()).to.equal(newFeeRate);
    });

    it("Should allow owner to update pixel cost", async function () {
      const newPixelCost = ethers.parseEther("1.2");
      await expect(this.landBankAdmin.updatePixelCost(newPixelCost))
        .to.emit(this.landBankAdmin, "PixelCostUpdated")
        .withArgs(newPixelCost);

      expect(await this.landBank.getPixelCost()).to.equal(newPixelCost);
    });

    it("Should allow owner to update max district ID", async function () {
      const newMaxDistrictId = 20;
      await expect(this.landBankAdmin.updateMaxDistrictId(newMaxDistrictId))
        .to.emit(this.landBankAdmin, "MaxDistrictIdUpdated")
        .withArgs(newMaxDistrictId);

      expect(await this.landBank.getMaxDistrictId()).to.equal(newMaxDistrictId);
    });

    it("Should not allow non-owners to update contract parameters", async function () {
      await expect(this.landBankAdminAsUser1.updateFeeRate(300)).to.be.reverted;
      await expect(
        this.landBankAdminAsUser1.updatePixelCost(ethers.parseEther("0.2")),
      ).to.be.reverted;
      await expect(this.landBankAdminAsUser1.updateMaxDistrictId(20)).to.be
        .reverted;
    });

    it("Should allow admins adjustments to rebuyDelay to affect LandBank rebuy wait period", async function () {
      // Have user1 mint and claim LandPixel 1
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBankAsUser1.mintLandPixels([1], {
        value: this.initialPixelCost,
      });

      // Approve the LandBank contract to transfer the user's LandPixel
      await this.landPixelAsUser1.approve(this.landBank.target, 1);

      const initialBalance = await ethers.provider.getBalance(
        this.user1.address,
      );

      const newRebuyDelay = 86400;
      await expect(this.landBankAdmin.updateRebuyDelay(newRebuyDelay))
        .to.emit(this.landBankAdmin, "RebuyDelayUpdated")
        .withArgs(newRebuyDelay);

      // Advance time by 1 day + 1 second and mine a new block
      await time.increase(86401);

      await expect(this.landBankAsUser1.sellLandPixel(1))
        .to.emit(this.landBank, "LandPixelSold")
        .withArgs(this.user1.address, 1);

      // Verify that the LandBank is now the owner of the LandPixel
      expect(await this.landPixel.ownerOf(1)).to.eq(this.landBank.target);

      // Verify user made some nonzero profit from the sale
      const finalBalance = await ethers.provider.getBalance(this.user1.address);
      expect(finalBalance - initialBalance).to.be.greaterThan(0);
    });
  });

  describe("Withdrawals", function () {
    beforeEach(async function () {
      // Fund the LandBank contract
      await this.owner.sendTransaction({
        to: await this.landBank.getAddress(),
        value: ethers.parseEther("1.0"),
      });
    });

    it("Should allow owner to withdraw native tokens", async function () {
      const withdrawAmount = ethers.parseEther("0.5");
      const initialBalance = await ethers.provider.getBalance(
        this.user2.address,
      );

      await expect(
        this.landBankAdmin.adminWithdraw(this.user2.address, withdrawAmount),
      )
        .to.emit(this.landBankAdmin, "AdminWithdrawal")
        .withArgs(this.user2.address, withdrawAmount);

      const finalBalance = await ethers.provider.getBalance(this.user2.address);
      expect(finalBalance - initialBalance).to.equal(withdrawAmount);

      const landBankBalance = await ethers.provider.getBalance(
        await this.landBank.getAddress(),
      );
      expect(landBankBalance).to.equal(ethers.parseEther("0.5"));
    });

    it("Should allow owner to withdraw ERC20 tokens", async function () {
      // Set up ERC20 token for withdrawal test
      const ERC20TokenFactory =
        await hre.ethers.getContractFactory("DSTRXToken");
      const erc20Token = await ERC20TokenFactory.deploy(this.owner.address);

      // Mint some of the ERC20 tokens to the LandBank
      await erc20Token.mint(
        await this.landBank.getAddress(),
        ethers.parseEther("1000"),
      );

      const withdrawAmount = ethers.parseEther("500");
      await expect(
        this.landBankAdmin.adminWithdrawTokens(
          await erc20Token.getAddress(),
          this.user2.address,
          withdrawAmount,
        ),
      )
        .to.emit(this.landBankAdmin, "AdminTokenWithdrawal")
        .withArgs(
          await erc20Token.getAddress(),
          this.user2.address,
          withdrawAmount,
        );

      expect(await erc20Token.balanceOf(this.user2.address)).to.equal(
        withdrawAmount,
      );
    });

    it("Should not allow non-owners to withdraw", async function () {
      await expect(
        this.landBankAdminAsUser1.adminWithdraw(
          this.user1.address,
          ethers.parseEther("0.1"),
        ),
      ).to.be.reverted;

      // Set up ERC20 token for token withdrawal test
      const ERC20TokenFactory =
        await hre.ethers.getContractFactory("DSTRXToken");
      const erc20Token = await ERC20TokenFactory.deploy(this.owner.address);

      // Mint some ERC20 tokens to the LandBank
      await erc20Token.mint(
        await this.landBank.getAddress(),
        ethers.parseEther("1000"),
      );

      await expect(
        this.landBankAdminAsUser1.adminWithdrawTokens(
          await erc20Token.getAddress(),
          this.user1.address,
          100,
        ),
      ).to.be.reverted;
    });
  });

  describe("Staking", function () {
    beforeEach(async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBankAsUser1.mintLandPixels([1], {
        value: this.initialPixelCost,
      });
      await this.landPixelAsUser1.approve(this.landBank.target, 1);
    });

    it("Should allow staking a LandPixel", async function () {
      await expect(this.stakingAsUser1.stakeLandPixel(1))
        .to.emit(this.staking, "Staked")
        .withArgs(this.user1.address, 1);

      const [owner, startBlock, pendingRewards] =
        await this.staking.getStakeInfo(1);
      expect(owner).to.equal(this.user1.address);
      expect(startBlock).to.be.gt(0);
      expect(pendingRewards).to.equal(0);
    });

    it("Should allow staking multiple LandPixels", async function () {
      await this.landBankAsUser1.mintLandPixels([2, 3], {
        value: this.initialPixelCost * BigInt(2),
      });
      await this.landPixelAsUser1.setApprovalForAll(this.landBank.target, true);

      await expect(this.stakingAsUser1.stakeLandPixel(2))
        .to.emit(this.staking, "Staked")
        .withArgs(this.user1.address, 2);

      await expect(this.stakingAsUser1.stakeLandPixel(3))
        .to.emit(this.staking, "Staked")
        .withArgs(this.user1.address, 3);

      const [owner, startBlock] = await this.staking.getStakeInfo(2);
      expect(owner).to.equal(this.user1.address);
      expect(startBlock).to.be.gt(0);

      // Expect the second LandPixel to have no pending rewards yet
      const [
        ownerOfSecondPixel,
        startBlockOfSecondPixel,
        pendingRewardsOfSecondPixel,
      ] = await this.staking.getStakeInfo(3);
      expect(ownerOfSecondPixel).to.equal(this.user1.address);
      expect(startBlockOfSecondPixel).to.be.gt(0);
      expect(pendingRewardsOfSecondPixel).to.equal(0);
    });

    it("Should not allow staking a LandPixel that is not owned", async function () {
      await expect(
        this.staking.connect(this.user2).stakeLandPixel(1),
      ).to.be.revertedWith("Not token owner");
    });

    it("Should allow claiming staking rewards", async function () {
      await this.stakingAsUser1.stakeLandPixel(1);

      // Advance blocks to accumulate rewards
      await ethers.provider.send("hardhat_mine", ["0x100"]); // Mine 256 blocks

      const initialBalance = await this.dstrxToken.balanceOf(
        this.user1.address,
      );

      await this.stakingAsUser1.claimAllRewards();

      const finalBalance = await this.dstrxToken.balanceOf(this.user1.address);
      expect(finalBalance).to.be.gt(initialBalance);
    });

    it("Should not allow claiming rewards for unstaked LandPixel", async function () {
      await expect(this.stakingAsUser1.claimAllRewards()).to.be.revertedWith(
        "No rewards to claim",
      );
    });

    it("Should calculate rewards correctly based on blocks elapsed", async function () {
      await this.stakingAsUser1.stakeLandPixel(1);

      // Get initial pending rewards
      const initialPending = await this.staking.getPendingRewards(
        this.user1.address,
      );

      // Mine some blocks
      await ethers.provider.send("hardhat_mine", ["0x100"]); // Mine 256 blocks

      // Get new pending rewards
      const newPending = await this.staking.getPendingRewards(
        this.user1.address,
      );

      // Verify rewards increased
      expect(newPending).to.be.gt(initialPending);
    });

    it("Should respect the staking allocation limit", async function () {
      // Get allocation after initial minting (which creates some DSTRX tokens)
      const allocation = await this.staking.getRemainingSupply();
      const expectedAllocation =
        ethers.parseEther("100000000") - ethers.parseEther("100"); // 100M initial allocation minus 100 DSTRX from minting
      expect(allocation).to.equal(expectedAllocation);

      await this.stakingAsUser1.stakeLandPixel(1);

      // Mine many blocks to accumulate significant rewards
      await ethers.provider.send("hardhat_mine", ["0x1000"]); // Mine 4096 blocks

      // Claim all rewards and then unstake
      await this.stakingAsUser1.claimAllRewards();
      await this.stakingAsUser1.unstakeLandPixel(1);

      // Check new available allocation is less than initial
      const newAllocation = await this.staking.getRemainingSupply();
      expect(newAllocation).to.be.lt(allocation);
    });
  });

  describe("Buying Land from Bank", function () {
    beforeEach(async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      // Mint LandPixels to the LandBank
      await this.landBank.mintLandPixels([1, 2, 3], {
        value: this.initialPixelCost * BigInt(3),
      });
    });

    it("Should allow buying unstaked land from the bank", async function () {
      // Have owner sell LandPixel 1 back to the bank
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);
      await this.landPixel.approve(this.landBank.target, 1);
      await this.landBank.sellLandPixel(1);

      await expect(
        this.landBankAsUser1.buyLandPixels([1], {
          value: this.initialPixelCost,
        }),
      )
        .to.emit(this.landBank, "LandPixelBought")
        .withArgs(this.user1.address, 1);

      expect(await this.landPixel.ownerOf(1)).to.equal(this.user1.address);
    });

    it("Should not allow buying staked land from the bank", async function () {
      // Stake LandPixel 2
      await this.landPixel.approve(this.landBank.target, 2);
      await this.staking.stakeLandPixel(2);

      await expect(
        this.landBankAsUser1.buyLandPixels([2], {
          value: this.initialPixelCost,
        }),
      ).to.be.revertedWith("LandPixelAlreadyStaked");
    });

    it("Should allow buying previously staked but now unstaked land from the bank", async function () {
      // Stake and then unstake LandPixel 2
      await this.landPixel.approve(this.landBank.target, 2);
      await this.staking.stakeLandPixel(2);
      await this.staking.unstakeLandPixel(2);

      // Sell LandPixel 2 back to the bank
      await this.landPixel.approve(this.landBank.target, 2);
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);
      await this.landBank.sellLandPixel(2);

      await expect(
        this.landBankAsUser1.buyLandPixels([2], {
          value: this.initialPixelCost,
        }),
      )
        .to.emit(this.landBank, "LandPixelBought")
        .withArgs(this.user1.address, 2);

      expect(await this.landPixel.ownerOf(2)).to.equal(this.user1.address);
    });

    it("Should not allow buying land not owned by the bank", async function () {
      // Have owner sell LandPixel 1 back to the bank
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);
      await this.landPixel.approve(this.landBank.target, 1);
      await this.landBank.sellLandPixel(1);

      // Have user1 buy LandPixel 1
      await this.landBankAsUser1.buyLandPixels([1], {
        value: this.initialPixelCost,
      });

      // Now, try to have user2 buy the same LandPixel
      await expect(
        this.landBank.connect(this.user2).buyLandPixels([1], {
          value: this.initialPixelCost,
        }),
      ).to.be.revertedWith("LandPixelNotAvailable");
    });

    it("Should refund excess payment when buying land from bank", async function () {
      // Have owner sell LandPixel 1 back to the bank
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);
      await this.landPixel.approve(this.landBank.target, 1);
      await this.landBank.sellLandPixel(1);

      const excessPayment = this.initialPixelCost * BigInt(2);
      const initialBalance = await ethers.provider.getBalance(
        this.user1.address,
      );

      await this.landBankAsUser1.buyLandPixels([1], { value: excessPayment });

      const finalBalance = await ethers.provider.getBalance(this.user1.address);
      expect(initialBalance - finalBalance).to.be.closeTo(
        this.initialPixelCost,
        ethers.parseEther("0.01"), // Allow for gas costs
      );
    });
  });

  describe("Floor Price", function () {
    it("Should calculate the correct floor price", async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBank.mintLandPixels([1], { value: this.initialPixelCost });

      // First calculate how much of the deposit remains after burn (20% burn)
      const remainingAfterBurn =
        (this.initialPixelCost * BigInt(8000)) / BigInt(10000);

      // Then calculate fee on the remaining amount
      const fee =
        (remainingAfterBurn * BigInt(this.initialFeeRate)) / BigInt(10000);
      const expectedFloorPrice = remainingAfterBurn - fee;

      expect(await this.landBank.floorPrice()).to.equal(expectedFloorPrice);
    });

    it("Should update floor price when contract balance changes", async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBank.mintLandPixels([1], { value: this.initialPixelCost });

      const initialFloorPrice = await this.landBank.floorPrice();

      // Send additional ETH to the contract
      await this.owner.sendTransaction({
        to: this.landBank.target,
        value: ethers.parseEther("1.0"),
      });

      const newFloorPrice = await this.landBank.floorPrice();
      expect(newFloorPrice).to.be.gt(initialFloorPrice);
    });

    it("Should accept direct payments from arbitrary payers and increase floor price", async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);
      await this.landBank.mintLandPixels([1, 2], {
        value: this.initialPixelCost * BigInt(2),
      });

      const initialFloorPrice = await this.landBank.floorPrice();

      // Send 1 ETH directly to the LandBank
      await this.user1.sendTransaction({
        to: this.landBank.target,
        value: ethers.parseEther("2"),
      });

      // With 2 outstanding LandPixels, a funding tx of 2 ETH, and a 2.00% fee
      // floorPrice should be expected to go up by 0.98 ETH
      const newFloorPrice = await this.landBank.floorPrice();
      expect(newFloorPrice).to.eq(
        initialFloorPrice + ethers.parseEther("0.98"),
      );
    });

    it("Should calculate the correct floor price based on circulating supply", async function () {
      await this.landBankAdmin.updateMaxDistrictId(10);

      // Mint 5 LandPixels
      await this.landBank.mintLandPixels([1, 2, 3, 4, 5], {
        value: this.initialPixelCost * BigInt(5),
      });

      // First calculate how much of the deposit remains after burn (20% burn)
      const remainingAfterBurn =
        (this.initialPixelCost * BigInt(8000)) / BigInt(10000);

      // Then calculate fee on the remaining amount
      const fee =
        (remainingAfterBurn * BigInt(this.initialFeeRate)) / BigInt(10000);
      const expectedFloorPrice = remainingAfterBurn - fee;

      expect(await this.landBank.floorPrice()).to.equal(expectedFloorPrice);

      // Sell one LandPixel back to the bank
      await time.increase(ONE_WEEK_PLUS_ONE_SECOND);
      await this.landPixel.approve(this.landBank.target, 1);
      await this.landBank.sellLandPixel(1);

      // New expected floor price should be slightly higher due to LandBank's collected fees
      expect(await this.landBank.floorPrice()).to.be.gt(expectedFloorPrice);

      expect(await this.landBank.floorPrice()).to.be.closeTo(
        expectedFloorPrice,
        5 * 1e15, // decimals == 1e18 so this means "within 0.005 of expectedFloorPrice"
      );
    });
  });

  describe("Reentrancy Protection", function () {
    let attacker: any;

    beforeEach(async function () {
      // Deploy the attacker contract
      const MockReentrantAttacker = await ethers.getContractFactory(
        "MockReentrantAttacker",
      );
      attacker = await MockReentrantAttacker.deploy(
        await this.landBank.getAddress(),
      );

      // Set up initial conditions
      await this.landBankAdmin.updateMaxDistrictId(10);

      // Fund the attacker contract with some ETH
      await this.owner.sendTransaction({
        to: await attacker.getAddress(),
        value: ethers.parseEther("1.0"), // Send 1 ETH to fund attack attempts
      });
    });

    it("Should prevent reentrant calls during mintLandPixels", async function () {
      const tokenIds = [1];
      const attackValue = this.initialPixelCost;

      // Attempt the reentrant attack
      await expect(attacker.attack(tokenIds, { value: attackValue })).to.be
        .reverted;

      // Verify that no tokens were minted
      await expect(this.landPixel.ownerOf(1)).to.be.reverted;
    });
  });
});
