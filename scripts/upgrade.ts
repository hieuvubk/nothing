import { ethers } from "hardhat";
import { getSelectors, FacetCutAction } from "./libraries/diamond";

async function upgradeLandBankMainFacet() {
  //const accounts = await ethers.getSigners();
  //const contractOwner = accounts[0];

  // Deploy new version of LandBankMainFacet
  console.log("Deploying new LandBankMainFacet...");
  const LandBankMainFacet =
    await ethers.getContractFactory("LandBankMainFacet");
  const landBankFacet = await LandBankMainFacet.deploy();
  await landBankFacet.waitForDeployment();
  const newFacetAddress = await landBankFacet.getAddress();
  console.log("New LandBankMainFacet deployed:", newFacetAddress);

  // Update to actual diamond contract address
  const diamondAddress = "0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575";
  console.log("Upgrading Diamond at:", diamondAddress);

  // Create cut with replace
  const facetCuts = [
    {
      facetAddress: newFacetAddress,
      action: FacetCutAction.Replace,
      functionSelectors: getSelectors(landBankFacet),
    },
  ];

  // Get the diamond contract
  const diamond = await ethers.getContractAt("DiamondCutFacet", diamondAddress);

  // If anything needs initialization, do it here e.g.:
  // const DiamondInit = await ethers.getContractFactory("DiamondInit");
  // const diamondInit = await DiamondInit.deploy();
  // await diamondInit.waitForDeployment();
  // const functionCall = diamondInit.interface.encodeFunctionData("reinit", [/* params */]);

  // Perform the upgrade
  console.log("Executing upgrade...");
  const tx = await diamond.diamondCut(
    facetCuts,
    ethers.ZeroAddress, // No initializer
    "0x", // No initialization data
  );

  console.log("Waiting for upgrade transaction...");
  await tx.wait();
  console.log("Upgrade complete!");

  // Verify the upgrade
  console.log("Verifying upgrade...");
  const upgradedFacet = await ethers.getContractAt(
    "LandBankMainFacet",
    diamondAddress,
  );

  // Basic pixelCost verification (copied from deploy script)
  const pixelCost = await upgradedFacet.getPixelCost();
  if (pixelCost === 0n) {
    throw new Error("Zero pixel cost after upgrade");
  }

  console.log("Upgrade verified successfully!");
  return diamondAddress;
}

// Execute the upgrade
if (require.main === module) {
  upgradeLandBankMainFacet()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.upgradeLandBankMainFacet = upgradeLandBankMainFacet;
