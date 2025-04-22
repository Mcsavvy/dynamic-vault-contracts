import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RWAAssetContract } from "../typechain-types";

describe("RWAAssetContract", function () {
  let rwaAssetContract: RWAAssetContract;
  let owner: HardhatEthersSigner;
  let pricingAgent: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
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
    isVerified: true
  };

  beforeEach(async function () {
    // Deploy the contract
    [owner, pricingAgent, buyer] = await ethers.getSigners();
    
    const RWAAssetContractFactory = await ethers.getContractFactory("RWAAssetContract");
    rwaAssetContract = await RWAAssetContractFactory.deploy(tokenName, tokenSymbol) as unknown as RWAAssetContract;
    
    // Set pricing agent
    await rwaAssetContract.setPricingAgent(pricingAgent.address);
    
    // Mint a token for testing
    const mintTx = await rwaAssetContract.mint(
      owner.address,
      tokenURI,
      initialPrice,
      assetMetadata
    );
    
    const receipt = await mintTx.wait();
    const event = receipt?.logs[0];
    tokenId = BigInt(1); // We know it's the first token
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await rwaAssetContract.owner()).to.equal(owner.address);
    });

    it("Should set the right token name and symbol", async function () {
      expect(await rwaAssetContract.name()).to.equal(tokenName);
      expect(await rwaAssetContract.symbol()).to.equal(tokenSymbol);
    });
  });

  describe("Minting", function () {
    it("Should mint a new token with correct properties", async function () {
      expect(await rwaAssetContract.ownerOf(tokenId)).to.equal(owner.address);
      expect(await rwaAssetContract.tokenURI(tokenId)).to.equal(tokenURI);
      expect(await rwaAssetContract.getPrice(tokenId)).to.equal(initialPrice);
      expect(await rwaAssetContract.getInitialPrice(tokenId)).to.equal(initialPrice);
      
      const metadata = await rwaAssetContract.getAssetMetadata(tokenId);
      expect(metadata.name).to.equal(assetMetadata.name);
      expect(metadata.assetType).to.equal(assetMetadata.assetType);
      expect(metadata.assetLocation).to.equal(assetMetadata.assetLocation);
      expect(metadata.acquisitionDate).to.equal(assetMetadata.acquisitionDate);
      expect(metadata.description).to.equal(assetMetadata.description);
      expect(metadata.isVerified).to.equal(assetMetadata.isVerified);
    });

    it("Should emit AssetMinted event on mint", async function () {
      const newTokenId = BigInt(2);
      await expect(rwaAssetContract.mint(
        buyer.address,
        "https://metadata.dynamicvault.com/token/2",
        ethers.parseEther("20"),
        {
          name: "Starry Night",
          assetType: "Art",
          assetLocation: "New York, USA",
          acquisitionDate: Math.floor(Date.now() / 1000),
          description: "A famous painting by Vincent van Gogh",
          isVerified: true
        }
      ))
        .to.emit(rwaAssetContract, "AssetMinted")
        .withArgs(newTokenId, "https://metadata.dynamicvault.com/token/2", ethers.parseEther("20"), buyer.address);
    });

    it("Should revert when non-owner tries to mint", async function () {
      await expect(rwaAssetContract.connect(buyer).mint(
        buyer.address,
        "https://metadata.dynamicvault.com/token/2",
        ethers.parseEther("20"),
        assetMetadata
      )).to.be.revertedWithCustomError(rwaAssetContract, "OwnableUnauthorizedAccount");
    });
  });

  describe("Price Management", function () {
    it("Should update price when pricing agent calls", async function () {
      const newPrice = ethers.parseEther("15");
      
      await expect(rwaAssetContract.connect(pricingAgent).updatePrice(tokenId, newPrice))
        .to.emit(rwaAssetContract, "PriceUpdated")
        .withArgs(tokenId, initialPrice, newPrice);
      
      expect(await rwaAssetContract.getPrice(tokenId)).to.equal(newPrice);
    });

    it("Should revert when non-pricing agent tries to update price", async function () {
      const newPrice = ethers.parseEther("15");
      
      await expect(rwaAssetContract.connect(buyer).updatePrice(tokenId, newPrice))
        .to.be.revertedWith("RWAAssetContract: Only pricing agent can update prices");
    });

    it("Should revert when trying to get price of non-existent token", async function () {
      const nonExistentTokenId = BigInt(999);
      
      await expect(rwaAssetContract.getPrice(nonExistentTokenId))
        .to.be.revertedWith("RWAAssetContract: Token does not exist");
    });
  });

  describe("Admin Functions", function () {
    it("Should update pricing agent", async function () {
      const newPricingAgent = buyer.address;
      
      await expect(rwaAssetContract.setPricingAgent(newPricingAgent))
        .to.emit(rwaAssetContract, "PricingAgentUpdated")
        .withArgs(pricingAgent.address, newPricingAgent);
      
      expect(await rwaAssetContract.getPricingAgent()).to.equal(newPricingAgent);
    });

    it("Should revert when non-owner tries to update pricing agent", async function () {
      await expect(rwaAssetContract.connect(buyer).setPricingAgent(buyer.address))
        .to.be.revertedWithCustomError(rwaAssetContract, "OwnableUnauthorizedAccount");
    });
  });
});