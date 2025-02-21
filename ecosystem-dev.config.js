module.exports = {
    apps: [
        {
        name: "hardhat-dev", 
        script: "npx", 
        args: "hardhat node --port 8545", 
        watch: false, 
        autorestart: true
        },
    ],
};