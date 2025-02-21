// Custom Error decoder helper script
// This script finds all custom errors in Solidity contracts and calculates their keccak256 hashes
// Usage (from root of repo): node scripts/getCustomErrors.js -d <directory> <custom-error-hash>
// Example: node scripts/getCustomErrors.js -d contracts/facets 0x00a5a1f5
// If no custom-error-hash is provided, it will print the info for all custom errors in the directory
// If a custom-error-hash is provided, it will print the contract and error that matches the hash
// Passing a directory is optional with the -d flag, default is "./"

const fs = require("fs");
const path = require("path");
const { keccak256 } = require("ethereum-cryptography/keccak");
const { TextEncoder } = require("util");

// Function to calculate keccak256 hash of error signature
function calculateErrorHash(errorName, params = []) {
  const signature = `${errorName}(${params.join(",")})`;
  const encoder = new TextEncoder();
  const encodedSignature = encoder.encode(signature);
  const hash = keccak256(encodedSignature);
  return hash.slice(0, 4); // Take first 4 bytes for selector
}

// Function to extract custom errors from Solidity file content
function extractCustomErrors(content) {
  const errors = [];
  const errorRegex = /error\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\)/g;

  let match;
  while ((match = errorRegex.exec(content)) !== null) {
    const errorName = match[1];
    const paramsString = match[2].trim();
    const params = paramsString
      ? paramsString.split(",").map((param) => {
          // Extract the parameter type
          const trimmedParam = param.trim();
          const paramParts = trimmedParam.split(" ");
          return paramParts[0]; // Return just the type
        })
      : [];

    errors.push({ name: errorName, params });
  }

  return errors;
}

// Function to recursively find all Solidity files in a directory
function findSolidityFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively search directories
      findSolidityFiles(filePath, fileList);
    } else if (path.extname(file) === ".sol") {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Main function to analyze contracts
function analyzeContracts(contractsDir, searchHash) {
  console.log("Analyzing contracts for custom errors...\n");

  const solidityFiles = findSolidityFiles(contractsDir);
  const allErrors = new Map(); // Use Map to track which contract each error comes from

  solidityFiles.forEach((filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const contractName = path.basename(filePath, ".sol");
    const errors = extractCustomErrors(content);

    errors.forEach((error) => {
      const hash = calculateErrorHash(error.name, error.params);
      const hashHex = Buffer.from(hash).toString("hex");
      allErrors.set(`${contractName}.${error.name}`, {
        signature: `${error.name}(${error.params.join(",")})`,
        selector: `0x${hashHex}`,
        contract: contractName,
      });

      if (
        searchHash == hashHex ||
        searchHash == `0x${hashHex}` ||
        (searchHash && hashHex.startsWith(searchHash.replace("0x", ""))) ||
        (searchHash && hashHex.startsWith(searchHash.substring(2)))
      ) {
        console.log("Custom Error Match");
        console.log("======================\n");
        console.log(`Contract: ${contractName}`);
        console.log(`Error: ${contractName}.${error.name}`);
        console.log(`Signature: ${error.name}(${error.params.join(",")})`);
        console.log(`Selector: 0x${hashHex}`);
        console.log("----------------------\n");
        return;
      }
    });
  });

  if (searchHash.length === 0) {
    // Print results in a organized format
    const outputHeader = `Custom Errors in ${contractsDir}:`;
    console.log(outputHeader);
    console.log(`${"=".repeat(outputHeader.length)}\n`);

    for (const [errorPath, data] of allErrors) {
      console.log(`Contract: ${data.contract}`);
      console.log(`Error: ${errorPath}`);
      console.log(`Signature: ${data.signature}`);
      console.log(`Selector: ${data.selector}`);
      console.log(`${"-".repeat(outputHeader.length)}\n`);
    }

    console.log(`Total custom errors found: ${allErrors.size}`);
  }
}

// Function to parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let directory = "./";
  let searchHash = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-d" || args[i] === "--directory") {
      if (i + 1 < args.length) {
        directory = args[i + 1];
        i++; // Skip the next argument since we've used it
      }
    } else {
      // Assume any other argument is the search hash
      searchHash = args[i];
    }
  }

  return { directory, searchHash };
}

// Replace the example usage section at the bottom with:
const { directory, searchHash } = parseArgs();

if (!fs.existsSync(directory)) {
  console.error(`Directory not found: ${directory}`);
  process.exit(1);
}

analyzeContracts(directory, searchHash);
