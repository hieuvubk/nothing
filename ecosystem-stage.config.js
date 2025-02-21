module.exports = {
    apps: [
        {
        name: "hardhat-stage", 
        script: "npx", 
        args: "hardhat node --port 8546", 
        watch: false, 
        autorestart: true
        },
    ],
};