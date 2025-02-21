import hre from "hardhat";
import { expect } from "chai";
import { getSelectors } from "./util/getSelectors";

// Start test block
describe("LandPixel", function () {
  beforeEach(async function () {
    // Get the contractOwner and collector address
    const signers = await hre.ethers.getSigners();
    this.contractOwner = signers[0].address;
    this.collector = signers[1].address;

    this.owner = signers[0];

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
    this.LandPixel = await ethers.getContractAt(
      "LandPixelFacet",
      await this.landPixelDiamond.getAddress(),
    );

    // Deploy the contract and assign the deployed instance
    //this.LandPixel = await LandPixel.deploy(signers[0].address);
    this.landPixelAsCollector = this.LandPixel.connect(
      await hre.ethers.getSigner(this.collector),
    );

    await this.LandPixel.setMinter(await this.contractOwner);

    // Mint an initial set of NFTs
    await this.LandPixel.safeMint(this.contractOwner, 1);
    await this.LandPixel.safeMint(this.collector, 2);
    await this.LandPixel.safeMint(this.collector, 3);
    await this.LandPixel.safeMint(this.collector, 4);

    this.initialMint = [1, 2, 3, 4];
  });

  // Test cases
  it("Creates a token collection with a name", async function () {
    expect(await this.LandPixel.name()).to.exist;
    expect(await this.LandPixel.name()).to.equal("LandPixel");
  });

  it("Creates a token collection with a symbol", async function () {
    expect(await this.LandPixel.symbol()).to.exist;
    expect(await this.LandPixel.symbol()).to.equal("LPXL");
  });

  it("Is able to query the NFT balances of an address", async function () {
    expect(await this.LandPixel.balanceOf(this.collector)).to.equal(3);
  });

  it("Is able to mint new NFTs to the collection to collector", async function () {
    const tokenId = (this.initialMint.length + 1).toString();
    await this.LandPixel.safeMint(this.collector, tokenId);
    expect(await this.LandPixel.ownerOf(tokenId)).to.equal(this.collector);
  });

  it("Prevents NFTs from being re-minted when they have already been minted", async function () {
    await expect(this.LandPixel.safeMint(this.contractOwner, 1)).to.be.reverted;
  });

  it("Emits a transfer event for newly minted NFTs", async function () {
    const tokenId = (this.initialMint.length + 1).toString();
    await expect(this.LandPixel.safeMint(this.contractOwner, tokenId))
      .to.emit(this.LandPixel, "Transfer")
      .withArgs(
        "0x0000000000000000000000000000000000000000",
        this.contractOwner,
        tokenId,
      ); //NFTs are minted from zero address
  });

  it("Emits a Transfer event when transferring a NFT", async function () {
    const tokenId = this.initialMint[0].toString();
    await expect(
      this.LandPixel["safeTransferFrom(address,address,uint256)"](
        this.contractOwner,
        this.collector,
        tokenId,
      ),
    )
      .to.emit(this.LandPixel, "Transfer")
      .withArgs(this.contractOwner, this.collector, tokenId);
  });

  it("Approves an operator wallet to spend owner NFT", async function () {
    const tokenId = this.initialMint[0].toString();
    await this.LandPixel.approve(this.collector, tokenId);
    expect(await this.LandPixel.getApproved(tokenId)).to.equal(this.collector);
  });

  it("Emits an Approval event when an operator is approved to spend a NFT", async function () {
    const tokenId = this.initialMint[0].toString();
    await expect(this.LandPixel.approve(this.collector, tokenId))
      .to.emit(this.LandPixel, "Approval")
      .withArgs(this.contractOwner, this.collector, tokenId);
  });

  it("Allows operator to transfer NFT on behalf of owner", async function () {
    const tokenId = this.initialMint[0].toString();
    await this.LandPixel.approve(this.collector, tokenId);
    // safeTransferFrom using the collector contract which signs with the collector's key
    await this.landPixelAsCollector[
      "safeTransferFrom(address,address,uint256)"
    ](this.contractOwner, this.collector, tokenId);
    expect(await this.LandPixel.ownerOf(tokenId)).to.equal(this.collector);
  });

  it("Approves an operator to spend all of an owner's NFTs", async function () {
    await this.LandPixel.setApprovalForAll(this.collector, true);
    expect(
      await this.LandPixel.isApprovedForAll(this.contractOwner, this.collector),
    ).to.equal(true);
  });

  it("Emits an ApprovalForAll event when an operator is approved to spend all NFTs", async function () {
    const isApproved = true;
    await expect(this.LandPixel.setApprovalForAll(this.collector, isApproved))
      .to.emit(this.LandPixel, "ApprovalForAll")
      .withArgs(this.contractOwner, this.collector, isApproved);
  });

  it("Removes an operator from spending all of owner's NFTs", async function () {
    // Approve all NFTs first
    await this.LandPixel.setApprovalForAll(this.collector, true);
    // Remove approval privileges
    await this.LandPixel.setApprovalForAll(this.collector, false);
    expect(
      await this.LandPixel.isApprovedForAll(this.contractOwner, this.collector),
    ).to.equal(false);
  });

  it("Allows operator to transfer all NFTs on behalf of owner", async function () {
    await this.landPixelAsCollector["setApprovalForAll(address,bool)"](
      this.contractOwner,
      true,
    );
    for (let i = 1; i < 4; i++) {
      await this.LandPixel["safeTransferFrom(address,address,uint256)"](
        this.collector,
        this.contractOwner,
        this.initialMint[i],
      );
    }
    expect(await this.LandPixel.balanceOf(this.contractOwner)).to.equal(
      this.initialMint.length.toString(),
    );
  });

  it("Only allows contractOwner to mint NFTs", async function () {
    await expect(this.landPixelAsCollector.safeMint(this.collector, "100")).to
      .be.reverted;
  });
});
