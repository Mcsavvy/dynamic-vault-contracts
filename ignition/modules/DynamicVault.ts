import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("DynamicVault", (m) => {
  // Deploy RWAAssetContract
  const rwaAssetContract = m.contract("RWAAssetContract", ["Dynamic Vault RWA", "DVRWA"]);

  // Deploy DynamicPricingAgent
  const dynamicPricingAgent = m.contract(
    "DynamicPricingAgent",
    [m.getAccount(0), rwaAssetContract]
  );

  // Deploy MarketplaceContract
  const marketplaceContract = m.contract(
    "MarketplaceContract",
    [m.getAccount(0), rwaAssetContract, m.getAccount(0)] // Using account[0] as fee collector initially
  );

  // Set DynamicPricingAgent as the pricing agent in RWAAssetContract
  m.call(rwaAssetContract, "setPricingAgent", [dynamicPricingAgent]);

  // Grant ORACLE_ROLE to account[0] for testing
  const oracleRole = m.staticCall(dynamicPricingAgent, "ORACLE_ROLE");
  m.call(dynamicPricingAgent, "grantRole", [oracleRole, m.getAccount(0)]);

  return {
    rwaAssetContract,
    dynamicPricingAgent,
    marketplaceContract,
  };
}); 