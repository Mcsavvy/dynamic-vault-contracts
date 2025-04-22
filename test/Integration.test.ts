import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RWAAssetContract, DynamicPricingAgent, MarketplaceContract } from "../typechain-types";

describe("Integration Tests", function () {
  let rwaAssetContract: RWAAssetContract;
  let dynamicPricingAgent: DynamicPricingAgent;
  let marketplaceContract: MarketplaceContract;
  let owner: HardhatEthersSigner;
  let oracle: HardhatEthersSigner;
  let admin: HardhatEthersSigner;
  let seller: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
  let feeCollector: HardhatEthersSigner;
  let tokenId: bigint;

  const tokenName = "Dynamic Vault RWA";
  const tokenSymbol = "DVRWA";
  const tokenURI = "https://metadata.dynamicvault.com/token/1";
  const initialPrice = ethers.parseEther("10");
  const listingPrice = ethers.parseEther("12");

  const assetMetadata = {
    name: "Mona Lisa",
    assetType: "Art",
    assetLocation: "Paris, France",
    acquisitionDate: Math.floor(Date.now() / 1000),
    description: "A famous portrait painting by Leonardo da Vinci",
    isVerified: true,
  };

  beforeEach(async function () {
    // Deploy all contracts
    [owner, oracle, admin, seller, buyer, feeCollector] =
      await ethers.getSigners();

    // Deploy RWAAssetContract
    const RWAAssetContractFactory = await ethers.getContractFactory(
      "RWAAssetContract"
    );
    rwaAssetContract = await RWAAssetContractFactory.deploy(tokenName, tokenSymbol) as unknown as RWAAssetContract;

    // Deploy DynamicPricingAgent
    const DynamicPricingAgentFactory = await ethers.getContractFactory(
      "DynamicPricingAgent"
    );
    dynamicPricingAgent = await DynamicPricingAgentFactory.deploy(
      admin.address,
      await rwaAssetContract.getAddress()
    ) as unknown as DynamicPricingAgent;

    // Set pricing agent
    await rwaAssetContract.setPricingAgent(
      await dynamicPricingAgent.getAddress()
    );

    // Grant oracle role to the oracle account
    const ORACLE_ROLE = await dynamicPricingAgent.ORACLE_ROLE();
    await dynamicPricingAgent
      .connect(admin)
      .grantRole(ORACLE_ROLE, oracle.address);

    // Deploy MarketplaceContract
    const MarketplaceContractFactory = await ethers.getContractFactory(
      "MarketplaceContract"
    );
    marketplaceContract = await MarketplaceContractFactory.deploy(
      owner.address,
      await rwaAssetContract.getAddress(),
      feeCollector.address
    ) as unknown as MarketplaceContract;

    // Mint a token for testing
    await rwaAssetContract.mint(
      seller.address,
      tokenURI,
      initialPrice,
      assetMetadata
    );

    tokenId = BigInt(1); // We know it's the first token
  });

  describe("End-to-End Flow", function () {
    it("Should handle the complete asset lifecycle with dynamic pricing", async function () {
      // 1. Oracle updates the price with AI-driven data
      const newPrice = ethers.parseEther("15");
      const dataSource = "AI-Model-v1";
      const confidenceScore = 85;

      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, newPrice, dataSource, confidenceScore);

      // Verify price was updated in RWAAssetContract
      expect(await rwaAssetContract.getPrice(tokenId)).to.equal(newPrice);

      // 2. Seller approves marketplace and lists the asset
      await rwaAssetContract
        .connect(seller)
        .approve(await marketplaceContract.getAddress(), tokenId);
      await marketplaceContract
        .connect(seller)
        .listAsset(tokenId, listingPrice);

      // 3. Oracle updates price again based on new market data
      const updatedPrice = ethers.parseEther("18");
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, updatedPrice, "AI-Model-v1-updated", 90);

      // Note: This doesn't affect the listing price, which remains fixed
      expect(await rwaAssetContract.getPrice(tokenId)).to.equal(updatedPrice);

      // 4. Buyer purchases the asset at the listing price
      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address
      );
      const feeCollectorBalanceBefore = await ethers.provider.getBalance(
        feeCollector.address
      );

      // Calculate fee
      const fee = (listingPrice * BigInt(250)) / BigInt(10000); // 2.5% fee
      const sellerProceeds = listingPrice - fee;

      await marketplaceContract
        .connect(buyer)
        .buy(tokenId, { value: listingPrice });

      // 5. Verify token ownership changed
      expect(await rwaAssetContract.ownerOf(tokenId)).to.equal(buyer.address);

      // 6. Verify seller received payment
      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address
      );
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
        sellerProceeds
      );

      // 7. Verify fee collector received fee
      const feeCollectorBalanceAfter = await ethers.provider.getBalance(
        feeCollector.address
      );
      expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(
        fee
      );

      // 8. Oracle updates price after the sale
      const postSalePrice = ethers.parseEther("20");
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, postSalePrice, "AI-Model-post-sale", 95);

      expect(await rwaAssetContract.getPrice(tokenId)).to.equal(postSalePrice);

      // 9. Verify price history is maintained
      const history = await dynamicPricingAgent.getPriceUpdateHistory(
        tokenId,
        0,
        3
      );
      expect(history.length).to.equal(3);

      expect(history[0].oldPrice).to.equal(initialPrice);
      expect(history[0].newPrice).to.equal(newPrice);

      expect(history[1].oldPrice).to.equal(newPrice);
      expect(history[1].newPrice).to.equal(updatedPrice);

      expect(history[2].oldPrice).to.equal(updatedPrice);
      expect(history[2].newPrice).to.equal(postSalePrice);
    });
  });

  describe("Contract Interaction Security", function () {
    it("Should only allow authorized interactions between contracts", async function () {
      // 1. Test that only the pricing agent can update prices
      await expect(
        rwaAssetContract.updatePrice(tokenId, ethers.parseEther("15"))
      ).to.be.revertedWith(
        "RWAAssetContract: Only pricing agent can update prices"
      );

      // 2. Test that only oracles can trigger price updates through the agent
      await expect(
        dynamicPricingAgent
          .connect(buyer)
          .updatePrice(tokenId, ethers.parseEther("15"), "Unauthorized", 85)
      ).to.be.revertedWithCustomError(
        dynamicPricingAgent,
        "AccessControlUnauthorizedAccount"
      );

      // 3. Test admin-only functions
      await expect(
        dynamicPricingAgent.connect(buyer).updateMinimumConfidenceScore(80)
      ).to.be.revertedWithCustomError(
        dynamicPricingAgent,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("Market Dynamics", function () {
    it("Should track token value correctly through multiple transactions", async function () {
      // First price update
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, ethers.parseEther("15"), "AI-Model-v1", 85);

      // First sale
      await rwaAssetContract
        .connect(seller)
        .approve(await marketplaceContract.getAddress(), tokenId);
      await marketplaceContract
        .connect(seller)
        .listAsset(tokenId, ethers.parseEther("16"));
      await marketplaceContract
        .connect(buyer)
        .buy(tokenId, { value: ethers.parseEther("16") });

      // Second price update
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, ethers.parseEther("20"), "AI-Model-v2", 88);

      // Second sale (buyer becomes seller)
      await rwaAssetContract
        .connect(buyer)
        .approve(await marketplaceContract.getAddress(), tokenId);
      await marketplaceContract
        .connect(buyer)
        .listAsset(tokenId, ethers.parseEther("22"));
      await marketplaceContract
        .connect(seller)
        .buy(tokenId, { value: ethers.parseEther("22") });

      // Verify ownership
      expect(await rwaAssetContract.ownerOf(tokenId)).to.equal(seller.address);

      // Verify price history is maintained through the transactions
      const history = await dynamicPricingAgent.getPriceUpdateHistory(
        tokenId,
        0,
        2
      );
      expect(history.length).to.equal(2);

      expect(history[0].oldPrice).to.equal(initialPrice);
      expect(history[0].newPrice).to.equal(ethers.parseEther("15"));

      expect(history[1].oldPrice).to.equal(ethers.parseEther("15"));
      expect(history[1].newPrice).to.equal(ethers.parseEther("20"));
    });
  });
});