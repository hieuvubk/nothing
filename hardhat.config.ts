import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { execSync } from "child_process";

const config: HardhatUserConfig = {
  solidity: "0.8.27",
  defaultNetwork: "localhost",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    holesky: {
      url: process.env.HOLESKY_URL || "",
    },
    sepolia: {
      url: process.env.SEPOLIA_URL || "",
    },
    mainnet: {
      url: process.env.MAINNET_URL || "",
    },
  },
};

// Check if forge is available by trying to execute it
const isFoundryAvailable = (): boolean => {
  try {
    execSync("forge --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

if (isFoundryAvailable()) {
  try {
    // Since this is a dynamic import, we need to use require here
    require("@nomicfoundation/hardhat-foundry");
  } catch (error) {
    console.warn(
      "Warning: hardhat-foundry plugin not found. Skipping Foundry integration.",
    );
  }
}

export default config;
