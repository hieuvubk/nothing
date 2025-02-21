import { ethers } from "hardhat";

import { getSelectors, FacetCutAction } from "./libraries/diamond";

import fs from "fs";
import path from "path";

async function deploySharedFacets() {
  const sharedFacets = {
    cuts: [],
    addresses: {},
  };

  // Deploy shared facets
  const SharedFacetNames = [
    "DiamondCutFacet",
    "DiamondLoupeFacet",
    "OwnershipFacet",
  ];

  for (const FacetName of SharedFacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.waitForDeployment();
    const facetAddress = await facet.getAddress();
    const facetContract = await ethers.getContractAt(FacetName, facetAddress);
    console.log(`${FacetName} deployed: ${facetAddress}`);

    sharedFacets.cuts.push({
      facetAddress: facetAddress,
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facetContract),
    });
    sharedFacets.addresses[FacetName] = facetAddress;
  }

  return sharedFacets;
}

async function deployLandPixelDiamond(sharedFacets) {
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  // Deploy LandPixelDiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded or deployed to initialize state variables
  const LandPixelDiamondInit = await ethers.getContractFactory(
    "LandPixelDiamondInit",
  );
  const landPixelDiamondInit = await LandPixelDiamondInit.deploy();
  await landPixelDiamondInit.waitForDeployment();
  console.log(
    "LandPixelDiamondInit deployed:",
    await landPixelDiamondInit.getAddress(),
  );

  // Deploy unique facets
  console.log("Deploying LandPixel unique facets");
  const UniqueFacetNames = ["LandPixelFacet"];
  const facetCuts = [...sharedFacets.cuts]; // Start with shared facets

  for (const FacetName of UniqueFacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.waitForDeployment();
    const facetContract = await ethers.getContractAt(
      FacetName,
      await facet.getAddress(),
    );
    console.log(`${FacetName} deployed: ${await facet.getAddress()}`);
    facetCuts.push({
      facetAddress: await facet.getAddress(),
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facetContract),
    });
  }

  // Set initialization parameters
  const functionCall =
    landPixelDiamondInit.interface.encodeFunctionData("init");

  // Log initialization parameters for reference purposes
  console.log("LandPixel Diamond initialization parameters:");
  console.log("- Init contract:", await landPixelDiamondInit.getAddress());
  console.log("- Function call data:", functionCall);

  // Assign arguments that will be used in the diamond constructor
  const diamondArgs = {
    owner: contractOwner.address,
    init: await landPixelDiamondInit.getAddress(),
    initCalldata: functionCall,
  };

  console.log("Diamond constructor arguments:", diamondArgs);

  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(facetCuts, diamondArgs);
  await diamond.waitForDeployment();
  const diamondAddress = await diamond.getAddress();
  console.log("LandPixel Diamond deployed:", diamondAddress);

  // Verify initialization
  const landPixelFacet = await ethers.getContractAt(
    "LandPixelFacet",
    diamondAddress,
  );
  const pixelName = await landPixelFacet.name();
  if (pixelName != "LandPixel") {
    throw new Error("LandPixel has wrong name: " + pixelName);
  }

  console.log(
    "\n==============================================================================",
  );
  console.log("LandPixel NFT Diamond available at:", diamondAddress);
  console.log(
    "==============================================================================\n\n",
  );

  return diamondAddress;
}

async function updateFrontendAddresses(
  dstrxAddress: string,
  landPixelAddress: string,
  landBankAddress: string,
  marketplaceAddress: string,
) {
  const constantsPath = path.join(__dirname, "../frontend/src/constants.js");

  try {
    // Create the constants file content
    const content = `// These are the default deployment addresses from a localhost (Hardhat) deployment
// from the parent root directory (with the \`npx hardhat run scripts/deploy.ts\` command)
// It may be necessary to adjust these depending on your deployment and whether you're
// testing locally or on a public testnet deployment of Districts

// Contract addresses
export const DSTRX_TOKEN_CONTRACT_ADDRESS = "${dstrxAddress}";
export const LANDPIXEL_CONTRACT_ADDRESS = "${landPixelAddress}";
export const LANDBANK_CONTRACT_ADDRESS = "${landBankAddress}";
export const MARKETPLACE_CONTRACT_ADDRESS = "${marketplaceAddress}";

// Network constants
// This is the default id used by a local Hardhat Network node
export const HARDHAT_NETWORK_ID = "31337";

// Error codes
// This is an error code that indicates that the user canceled a transaction
export const ERROR_CODE_TX_REJECTED_BY_USER = 4001;
`;

    fs.writeFileSync(constantsPath, content);
    console.log("Successfully created/updated constants.js");
  } catch (error) {
    console.error("Error updating constants:", error);
  }
}

async function copyArtifacts() {
  const artifactsToCopy = [
    "contracts/facets/LandBankStakingFacet.sol/LandBankStakingFacet.json",
    "contracts/facets/LandBankMainFacet.sol/LandBankMainFacet.json",
    "contracts/Marketplace.sol/LandPixelMarketplace.json",
  ];

  const artifactsDir = path.join(__dirname, "../artifacts");
  const frontendArtifactsDir = path.join(
    __dirname,
    "../frontend/src/artifacts",
  );

  // Create frontend artifacts directory if it doesn't exist
  if (!fs.existsSync(frontendArtifactsDir)) {
    fs.mkdirSync(frontendArtifactsDir, { recursive: true });
  }

  for (const artifact of artifactsToCopy) {
    const sourcePath = path.join(artifactsDir, artifact);
    const targetPath = path.join(frontendArtifactsDir, path.basename(artifact));

    try {
      fs.copyFileSync(sourcePath, targetPath);
      process.stdout.write(`\n${path.basename(artifact)} ✅`);
    } catch (error) {
      console.error(`Error copying ${artifact}:`, error);
    }
  }
}

async function deployDiamond() {
  const accounts = await ethers.getSigners();
  const contractOwner = accounts[0];

  // Deploy shared facets first
  console.log("Deploying shared facets...");
  const sharedFacets = await deploySharedFacets();

  // Deploy LandBankDiamondInit
  // DiamondInit provides a function that is called when the diamond is upgraded or deployed to initialize state variables
  const LandBankDiamondInit = await ethers.getContractFactory(
    "LandBankDiamondInit",
  );
  const landBankDiamondInit = await LandBankDiamondInit.deploy();
  await landBankDiamondInit.waitForDeployment();
  console.log(
    "LandBankDiamondInit deployed:",
    await landBankDiamondInit.getAddress(),
  );

  // Deploy unique facets
  console.log("Deploying LandBank unique facets");
  const UniqueFacetNames = [
    "AccessControlFacet",
    "LandBankAdminFacet",
    "LandBankMainFacet",
    "LandBankStakingFacet",
  ];
  const facetCuts = [...sharedFacets.cuts]; // Start with shared facets

  for (const FacetName of UniqueFacetNames) {
    const Facet = await ethers.getContractFactory(FacetName);
    const facet = await Facet.deploy();
    await facet.waitForDeployment();
    const facetContract = await ethers.getContractAt(
      FacetName,
      await facet.getAddress(),
    );
    console.log(`${FacetName} deployed: ${await facet.getAddress()}`);
    facetCuts.push({
      facetAddress: await facet.getAddress(),
      action: FacetCutAction.Add,
      functionSelectors: getSelectors(facetContract),
    });
  }

  // Deploy DSTRX Token
  const DSTRXToken = await ethers.getContractFactory("DSTRXToken");
  const dstrxToken = await DSTRXToken.deploy(contractOwner.address);
  await dstrxToken.waitForDeployment();
  const dstrxTokenAddress = await dstrxToken.getAddress();
  console.log("DSTRXToken deployed:", dstrxTokenAddress);

  // Deploy LandPixel Diamond NFT with shared facets
  const landPixelAddress = await deployLandPixelDiamond(sharedFacets);

  // Set initialization parameters
  const functionCall = landBankDiamondInit.interface.encodeFunctionData(
    "init",
    [landPixelAddress, dstrxTokenAddress],
  );

  // Log initialization parameters for reference purposes
  console.log("LandBank Diamond initialization parameters:");
  console.log("- LandPixel address:", landPixelAddress);
  console.log("- DSTRXToken address:", dstrxTokenAddress);
  console.log("- Init contract:", await landBankDiamondInit.getAddress());
  console.log("- Function call data:", functionCall);

  // Assign arguments that will be used in the diamond constructor
  const diamondArgs = {
    owner: contractOwner.address,
    init: await landBankDiamondInit.getAddress(),
    initCalldata: functionCall,
  };

  console.log("Diamond constructor arguments:", diamondArgs);

  const Diamond = await ethers.getContractFactory("Diamond");
  const diamond = await Diamond.deploy(facetCuts, diamondArgs);
  await diamond.waitForDeployment();
  const diamondAddress = await diamond.getAddress();
  console.log("Diamond deployed:", diamondAddress);

  // // Mint liquidity reserve (5M DSTRX) if a pre-mint is desired
  // // Alternatively, use diamondCut to add a temporary facet to allow liquidity reserve minting
  // // which can then be removed in a subsequent FacetCut operation
  // process.stdout.write("Minting liquidity reserve (5M DSTRX)...");
  // await dstrxToken.mint(diamondAddress, BigInt("5000000000000000000000000")); // 5M * 10^18
  // console.log(" ✅");

  // Transfer ownership of DSTRXToken to the LandBank Diamond AFTER it's fully deployed
  process.stdout.write("Setting up permissions...");
  // Set LandBank as the authorized minter
  const landPixelFacet = await ethers.getContractAt(
    "LandPixelFacet",
    landPixelAddress,
  );
  await landPixelFacet.setMinter(diamondAddress);
  // Transfer only DSTRXToken ownership to the LandBank
  await dstrxToken.transferOwnership(diamondAddress);
  console.log(" ✅");

  // Verify permissions
  const authorizedMinter = await landPixelFacet.getMinter();
  const dstrxTokenOwner = await dstrxToken.owner();

  if (authorizedMinter !== diamondAddress) {
    throw new Error("Minter role assignment failed!");
  }
  if (dstrxTokenOwner !== diamondAddress) {
    throw new Error("DSTRXToken ownership transfer failed!");
  }

  // Verify initialization
  const userFacet = await ethers.getContractAt(
    "LandBankMainFacet",
    diamondAddress,
  );
  const pixelCost = await userFacet.getPixelCost();
  if (pixelCost === 0n) {
    throw new Error("Zero pixel cost after initialization");
  }

  const LandPixelMarketplace = await ethers.getContractFactory(
    "LandPixelMarketplace",
  );

  // Deploy the contract
  const marketplace = await LandPixelMarketplace.deploy(
    contractOwner,
    landPixelAddress,
    diamondAddress,
  );

  await marketplace.waitForDeployment();

  console.log(
    "LandPixelMarketplace deployed to:",
    await marketplace.getAddress(),
  );

  // Update frontend addresses with marketplace
  console.log("\nUpdating frontend contract addresses...");
  await updateFrontendAddresses(
    dstrxTokenAddress,
    landPixelAddress,
    diamondAddress,
    await marketplace.getAddress(),
  );
  console.log("Frontend addresses updated ✅\n");

  process.stdout.write("Copying contract artifacts to frontend...");
  await copyArtifacts();

  console.log(
    "\n=========================================================================",
  );
  console.log("LandBank Diamond available at:", diamondAddress);
  console.log(
    "=========================================================================",
  );

  return diamondAddress;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
if (require.main === module) {
  deployDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployDiamond = deployDiamond;
