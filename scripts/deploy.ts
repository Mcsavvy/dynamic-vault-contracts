 import { ethers } from "hardhat";

 async function main() {
   const [deployer] = await ethers.getSigners();
   console.log("Deploying contracts with the account:", deployer.address);

   // Get initial balance
   const initialBalance = await ethers.provider.getBalance(deployer.address);
   console.log("Account balance:", ethers.formatEther(initialBalance));

   try {
     // 1. Deploy RWAAssetContract
     console.log("Deploying RWAAssetContract...");
     const RWAAssetContract = await ethers.getContractFactory(
       "RWAAssetContract"
     );
     const rwaAssetContract = await RWAAssetContract.deploy(
       "Dynamic Vault RWA",
       "DVRWA"
     );
     await rwaAssetContract.waitForDeployment();
     const rwaAssetContractAddress = await rwaAssetContract.getAddress();
     console.log("RWAAssetContract deployed to:", rwaAssetContractAddress);

     // 2. Deploy DynamicPricingAgent
     console.log("Deploying DynamicPricingAgent...");
     const DynamicPricingAgent = await ethers.getContractFactory(
       "DynamicPricingAgent"
     );
     const dynamicPricingAgent = await DynamicPricingAgent.deploy(
       deployer.address,
       rwaAssetContractAddress
     );
     await dynamicPricingAgent.waitForDeployment();
     const dynamicPricingAgentAddress = await dynamicPricingAgent.getAddress();
     console.log(
       "DynamicPricingAgent deployed to:",
       dynamicPricingAgentAddress
     );

     // 3. Deploy MarketplaceContract
     console.log("Deploying MarketplaceContract...");
     const MarketplaceContract = await ethers.getContractFactory(
       "MarketplaceContract"
     );
     const marketplaceContract = await MarketplaceContract.deploy(
       deployer.address,
       rwaAssetContractAddress,
       deployer.address // Using deployer as fee collector initially
     );
     await marketplaceContract.waitForDeployment();
     const marketplaceContractAddress = await marketplaceContract.getAddress();
     console.log(
       "MarketplaceContract deployed to:",
       marketplaceContractAddress
     );

     // 4. Set DynamicPricingAgent as the pricing agent in RWAAssetContract
     console.log("Setting pricing agent...");
     const setPricingAgentTx = await rwaAssetContract.setPricingAgent(
       dynamicPricingAgentAddress
     );
     await setPricingAgentTx.wait();
     console.log("DynamicPricingAgent set as pricing agent");

     // 5. Grant ORACLE_ROLE to deployer for testing
     console.log("Granting ORACLE_ROLE to deployer...");
     const ORACLE_ROLE = await dynamicPricingAgent.ORACLE_ROLE();
     const grantRoleTx = await dynamicPricingAgent.grantRole(
       ORACLE_ROLE,
       deployer.address
     );
     await grantRoleTx.wait();
     console.log("ORACLE_ROLE granted to deployer");

     // Log final deployment information
     console.log("\nDeployment complete!");
     console.log("RWAAssetContract:", rwaAssetContractAddress);
     console.log("DynamicPricingAgent:", dynamicPricingAgentAddress);
     console.log("MarketplaceContract:", marketplaceContractAddress);

     // Calculate gas used
     const finalBalance = await ethers.provider.getBalance(deployer.address);
     const gasUsed = initialBalance - finalBalance;
     console.log("Gas used:", ethers.formatEther(gasUsed), "ETH");
   } catch (error) {
     console.error("Error during deployment:", error);
     process.exit(1);
   }
 }

 main()
   .then(() => process.exit(0))
   .catch((error) => {
     console.error(error);
     process.exit(1);
   });