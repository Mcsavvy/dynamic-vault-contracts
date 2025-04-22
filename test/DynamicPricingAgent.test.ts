import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RWAAssetContract, DynamicPricingAgent } from "../typechain-types";

describe("DynamicPricingAgent", function () {
  let rwaAssetContract: RWAAssetContract;
  let dynamicPricingAgent: DynamicPricingAgent;
  let owner: HardhatEthersSigner;
  let oracle: HardhatEthersSigner;
  let admin: HardhatEthersSigner;
  let nonAdmin: HardhatEthersSigner;
  let tokenId: bigint;

  const tokenName = "Dynamic Vault RWA";
  const tokenSymbol = "DVRWA";
  const tokenURI = "https://metadata.dynamicvault.com/token/1";
  const initialPrice = ethers.parseEther("10");

  const assetMetadata = {
    name: "Mona Lisa",
    assetType: "Art",
    assetLocation: "Paris, France",
    acquisitionDate: Math.floor(Date.now() / 1000),
    description: "A famous portrait painting by Leonardo da Vinci",
    isVerified: true,
  };

  // Constants for price updates
  const newPrice = ethers.parseEther("15");
  const dataSource = "AI-Model-v1";
  const confidenceScore = 85;

  beforeEach(async function () {
    // Deploy the contracts
    [owner, oracle, admin, nonAdmin] = await ethers.getSigners();

    const RWAAssetContractFactory = await ethers.getContractFactory(
      "RWAAssetContract"
    );
    rwaAssetContract = await RWAAssetContractFactory.deploy(tokenName, tokenSymbol) as unknown as RWAAssetContract;

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

    // Mint a token for testing
    await rwaAssetContract.mint(
      owner.address,
      tokenURI,
      initialPrice,
      assetMetadata
    );

    tokenId = BigInt(1); // We know it's the first token
  });

  describe("Deployment", function () {
    it("Should set the right admin", async function () {
      const ADMIN_ROLE = await dynamicPricingAgent.ADMIN_ROLE();
      expect(await dynamicPricingAgent.hasRole(ADMIN_ROLE, admin.address)).to
        .be.true;
    });

    it("Should set the right RWAAssetContract", async function () {
      expect(await dynamicPricingAgent.getRWAAssetContract()).to.equal(
        await rwaAssetContract.getAddress()
      );
    });

    it("Should set the default minimum confidence score", async function () {
      expect(await dynamicPricingAgent.getMinimumConfidenceScore()).to.equal(
        70
      );
    });
  });

  describe("Price Updates", function () {
    it("Should update price when oracle calls", async function () {
      // Don't check events, just verify the price was updated
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, newPrice, dataSource, confidenceScore);

      expect(await rwaAssetContract.getPrice(tokenId)).to.equal(newPrice);
    });

    it("Should store price update in history", async function () {
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, newPrice, dataSource, confidenceScore);

      const latestUpdate = await dynamicPricingAgent.getLatestPriceUpdate(
        tokenId
      );
      expect(latestUpdate.tokenId).to.equal(tokenId);
      expect(latestUpdate.oldPrice).to.equal(initialPrice);
      expect(latestUpdate.newPrice).to.equal(newPrice);
      expect(latestUpdate.dataSource).to.equal(dataSource);
      expect(latestUpdate.confidenceScore).to.equal(confidenceScore);
    });

    it("Should revert when non-oracle tries to update price", async function () {
      await expect(
        dynamicPricingAgent
          .connect(nonAdmin)
          .updatePrice(tokenId, newPrice, dataSource, confidenceScore)
      ).to.be.revertedWithCustomError(
        dynamicPricingAgent,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should revert when confidence score is below minimum", async function () {
      const lowConfidenceScore = 65; // Below the default 70

      await expect(
        dynamicPricingAgent
          .connect(oracle)
          .updatePrice(tokenId, newPrice, dataSource, lowConfidenceScore)
      ).to.be.revertedWith(
        "DynamicPricingAgent: Confidence score below minimum"
      );
    });

    it("Should revert when confidence score is above 100", async function () {
      const highConfidenceScore = 105; // Above 100

      await expect(
        dynamicPricingAgent
          .connect(oracle)
          .updatePrice(tokenId, newPrice, dataSource, highConfidenceScore)
      ).to.be.revertedWith(
        "DynamicPricingAgent: Confidence score must be between 0 and 100"
      );
    });
  });

  describe("Price History", function () {
    beforeEach(async function () {
      // Add some price updates
      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, ethers.parseEther("15"), "AI-Model-v1", 85);

      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, ethers.parseEther("18"), "AI-Model-v1", 90);

      await dynamicPricingAgent
        .connect(oracle)
        .updatePrice(tokenId, ethers.parseEther("16"), "AI-Model-v1", 88);
    });

    it("Should retrieve price update history", async function () {
      const history = await dynamicPricingAgent.getPriceUpdateHistory(
        tokenId,
        0,
        3
      );
      expect(history.length).to.equal(3);

      expect(history[0].oldPrice).to.equal(initialPrice);
      expect(history[0].newPrice).to.equal(ethers.parseEther("15"));

      expect(history[1].oldPrice).to.equal(ethers.parseEther("15"));
      expect(history[1].newPrice).to.equal(ethers.parseEther("18"));

      expect(history[2].oldPrice).to.equal(ethers.parseEther("18"));
      expect(history[2].newPrice).to.equal(ethers.parseEther("16"));
    });

    it("Should retrieve partial history with offset and limit", async function () {
      const history = await dynamicPricingAgent.getPriceUpdateHistory(
        tokenId,
        1,
        1
      );
      expect(history.length).to.equal(1);

      expect(history[0].oldPrice).to.equal(ethers.parseEther("15"));
      expect(history[0].newPrice).to.equal(ethers.parseEther("18"));
    });

    it("Should return empty array when offset is out of bounds", async function () {
      const history = await dynamicPricingAgent.getPriceUpdateHistory(
        tokenId,
        10,
        1
      );
      expect(history.length).to.equal(0);
    });
  });

  describe("Admin Functions", function () {
    it("Should update RWAAssetContract address", async function () {
      const newRWAAssetContract = await (
        await ethers.getContractFactory("RWAAssetContract")
      ).deploy("New RWA", "NRWA") as unknown as RWAAssetContract;

      await expect(
        dynamicPricingAgent
          .connect(admin)
          .updateRWAAssetContract(await newRWAAssetContract.getAddress())
      )
        .to.emit(dynamicPricingAgent, "RWAAssetContractUpdated")
        .withArgs(
          await rwaAssetContract.getAddress(),
          await newRWAAssetContract.getAddress()
        );

      expect(await dynamicPricingAgent.getRWAAssetContract()).to.equal(
        await newRWAAssetContract.getAddress()
      );
    });

    it("Should update minimum confidence score", async function () {
      const newMinimumScore = 80;

      await expect(
        dynamicPricingAgent
          .connect(admin)
          .updateMinimumConfidenceScore(newMinimumScore)
      )
        .to.emit(dynamicPricingAgent, "MinimumConfidenceScoreUpdated")
        .withArgs(70, newMinimumScore);

      expect(await dynamicPricingAgent.getMinimumConfidenceScore()).to.equal(
        newMinimumScore
      );
    });

    it("Should revert when non-admin tries to update RWAAssetContract", async function () {
      const newRWAAssetContract = await (
        await ethers.getContractFactory("RWAAssetContract")
      ).deploy("New RWA", "NRWA") as unknown as RWAAssetContract;

      await expect(
        dynamicPricingAgent
          .connect(nonAdmin)
          .updateRWAAssetContract(await newRWAAssetContract.getAddress())
      ).to.be.revertedWithCustomError(
        dynamicPricingAgent,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should revert when non-admin tries to update minimum confidence score", async function () {
      await expect(
        dynamicPricingAgent.connect(nonAdmin).updateMinimumConfidenceScore(80)
      ).to.be.revertedWithCustomError(
        dynamicPricingAgent,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("Should revert when trying to set minimum confidence score above 100", async function () {
      await expect(
        dynamicPricingAgent.connect(admin).updateMinimumConfidenceScore(110)
      ).to.be.revertedWith(
        "DynamicPricingAgent: Confidence score must be between 0 and 100"
      );
    });
  });
});