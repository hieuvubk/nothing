import { ethers } from "hardhat";

async function main() {
  // Get the contract factory
  const UnlockDistrictVote =
    await ethers.getContractFactory("UnlockDistrictVote");

  // Deploy the contract
  const unlockDistrictVote = await UnlockDistrictVote.deploy(
    "0x6b6ff7577596134184ea123cb56FEf75E40cf779", // Replace with actual owner address
    "0xD381FB4C828A1987614B4BF3aB02d140813C4786", // Replace with actual DSTRX token address
    ethers.parseEther("1000"), // 1000 tokens threshold
    1000, // 10% burn rate (in basis points)
  );

  await unlockDistrictVote.waitForDeployment();

  console.log(
    "UnlockDistrictVote deployed to:",
    await unlockDistrictVote.getAddress(),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
