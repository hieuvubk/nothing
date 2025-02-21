import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LaunchLandBank", (m) => {
  // Use the first account (deployer) from the list of accounts
  const deployer = m.getAccount(0);

  // Deploy the LandBank contract, passing the deployer's address as the initial owner
  const landBank = m.contract("LandBank", [deployer]);

  return { landBank };
});
