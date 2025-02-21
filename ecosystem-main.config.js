module.exports = {
    apps: [
        {
        name: "hardhat-main", 
        script: "npx", 
        args: "hardhat node --port 8547", 
        watch: false, 
        autorestart: true
        },
    ],
};