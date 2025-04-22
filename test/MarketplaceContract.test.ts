import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { RWAAssetContract, MarketplaceContract } from "../typechain-types";

describe("MarketplaceContract", function () {
  let rwaAssetContract: RWAAssetContract;
  let marketplaceContract: MarketplaceContract;
  let owner: HardhatEthersSigner;
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
    // Deploy the contracts
    [owner, seller, buyer, feeCollector] = await ethers.getSigners();

    const RWAAssetContractFactory = await ethers.getContractFactory(
      "RWAAssetContract"
    );
    rwaAssetContract = await RWAAssetContractFactory.deploy(tokenName, tokenSymbol) as unknown as RWAAssetContract;

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

    // Approve marketplace to transfer the token
    await rwaAssetContract
      .connect(seller)
      .approve(await marketplaceContract.getAddress(), tokenId);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await marketplaceContract.owner()).to.equal(owner.address);
    });

    it("Should set the right RWAAssetContract", async function () {
      expect(await marketplaceContract.getRWAAssetContract()).to.equal(
        await rwaAssetContract.getAddress()
      );
    });

    it("Should set the right fee collector", async function () {
      expect(await marketplaceContract.getFeeCollector()).to.equal(
        feeCollector.address
      );
    });

    it("Should set the default marketplace fee percentage", async function () {
      expect(await marketplaceContract.getMarketplaceFee()).to.equal(250); // 2.5%
    });
  });

  describe("Listing Management", function () {
    it("Should create a listing", async function () {
      // Don't check events, check state changes
      await marketplaceContract.connect(seller).listAsset(tokenId, listingPrice);

      const listing = await marketplaceContract.getListing(tokenId);
      expect(listing.tokenId).to.equal(tokenId);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(listingPrice);
      expect(listing.isActive).to.be.true;
    });

    it("Should get active listings", async function () {
      await marketplaceContract
        .connect(seller)
        .listAsset(tokenId, listingPrice);

      const activeListings = await marketplaceContract.getActiveListings();
      expect(activeListings.length).to.equal(1);
      expect(activeListings[0].tokenId).to.equal(tokenId);
      expect(activeListings[0].seller).to.equal(seller.address);
      expect(activeListings[0].price).to.equal(listingPrice);
      expect(activeListings[0].isActive).to.be.true;
    });

    it("Should delist an asset", async function () {
      await marketplaceContract
        .connect(seller)
        .listAsset(tokenId, listingPrice);

      // Don't check events, check state changes
      await marketplaceContract.connect(seller).delistAsset(tokenId);

      const listing = await marketplaceContract.getListing(tokenId);
      expect(listing.isActive).to.be.false;

      const activeListings = await marketplaceContract.getActiveListings();
      expect(activeListings.length).to.equal(0);
    });

    it("Should revert when non-owner tries to list an asset", async function () {
      await expect(
        marketplaceContract.connect(buyer).listAsset(tokenId, listingPrice)
      ).to.be.revertedWith("MarketplaceContract: Only token owner can list");
    });

    it("Should revert when listing with zero price", async function () {
      await expect(
        marketplaceContract.connect(seller).listAsset(tokenId, 0)
      ).to.be.revertedWith(
        "MarketplaceContract: Price must be greater than 0"
      );
    });

    it("Should revert when marketplace is not approved", async function () {
      // Revoke approval
      await rwaAssetContract
        .connect(seller)
        .approve(ethers.ZeroAddress, tokenId);

      await expect(
        marketplaceContract.connect(seller).listAsset(tokenId, listingPrice)
      ).to.be.revertedWith(
        "MarketplaceContract: Marketplace not approved to transfer token"
      );
    });

    it("Should revert when non-seller tries to delist", async function () {
      await marketplaceContract
        .connect(seller)
        .listAsset(tokenId, listingPrice);

      await expect(
        marketplaceContract.connect(buyer).delistAsset(tokenId)
      ).to.be.revertedWith("MarketplaceContract: Only seller can delist");
    });

    it("Should revert when delisting non-listed asset", async function () {
      await expect(
        marketplaceContract.connect(seller).delistAsset(tokenId)
      ).to.be.revertedWith("MarketplaceContract: Asset not listed");
    });
  });

  describe("Buying", function () {
    beforeEach(async function () {
      // List the asset
      await marketplaceContract
        .connect(seller)
        .listAsset(tokenId, listingPrice);
    });

    it("Should buy an asset", async function () {
      const sellerBalanceBefore = await ethers.provider.getBalance(
        seller.address
      );
      const feeCollectorBalanceBefore = await ethers.provider.getBalance(
        feeCollector.address
      );

      // Calculate fee
      const fee = (listingPrice * BigInt(250)) / BigInt(10000); // 2.5% fee
      const sellerProceeds = listingPrice - fee;

      // Don't check events, check state changes
      await marketplaceContract
        .connect(buyer)
        .buy(tokenId, { value: listingPrice });

      // Check token ownership changed
      expect(await rwaAssetContract.ownerOf(tokenId)).to.equal(buyer.address);

      // Check listing is no longer active
      const listing = await marketplaceContract.getListing(tokenId);
      expect(listing.isActive).to.be.false;

      // Check seller received payment
      const sellerBalanceAfter = await ethers.provider.getBalance(
        seller.address
      );
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(
        sellerProceeds
      );

      // Check fee collector received fee
      const feeCollectorBalanceAfter = await ethers.provider.getBalance(
        feeCollector.address
      );
      expect(feeCollectorBalanceAfter - feeCollectorBalanceBefore).to.equal(
        fee
      );
    });

    it("Should handle excess payment refund", async function () {
      const excessPayment = ethers.parseEther("2");
      const totalPayment = listingPrice + excessPayment;

      const buyerBalanceBefore = await ethers.provider.getBalance(
        buyer.address
      );

      // Buy with excess payment
      const tx = await marketplaceContract
        .connect(buyer)
        .buy(tokenId, { value: totalPayment });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const buyerBalanceAfter = await ethers.provider.getBalance(
        buyer.address
      );

      // Buyer should have paid listingPrice + gas, and received back the excess
      const expectedCost = listingPrice + gasUsed;
      expect(buyerBalanceBefore - buyerBalanceAfter).to.equal(expectedCost);
    });

    it("Should revert when trying to buy non-listed asset", async function () {
      // Delist the asset
      await marketplaceContract.connect(seller).delistAsset(tokenId);

      await expect(
        marketplaceContract
          .connect(buyer)
          .buy(tokenId, { value: listingPrice })
      ).to.be.revertedWith("MarketplaceContract: Asset not listed");
    });

    it("Should revert when payment is insufficient", async function () {
      const insufficientPayment = listingPrice - BigInt(1);

      await expect(
        marketplaceContract
          .connect(buyer)
          .buy(tokenId, { value: insufficientPayment })
      ).to.be.revertedWith("MarketplaceContract: Insufficient funds");
    });
  });

  describe("Admin Functions", function () {
    it("Should update RWAAssetContract address", async function () {
      const newRWAAssetContract = await (
        await ethers.getContractFactory("RWAAssetContract")
      ).deploy("New RWA", "NRWA") as unknown as RWAAssetContract;

      await expect(
        marketplaceContract.updateRWAAssetContract(
          await newRWAAssetContract.getAddress()
        )
      )
        .to.emit(marketplaceContract, "RWAAssetContractUpdated")
        .withArgs(
          await rwaAssetContract.getAddress(),
          await newRWAAssetContract.getAddress()
        );

      expect(await marketplaceContract.getRWAAssetContract()).to.equal(
        await newRWAAssetContract.getAddress()
      );
    });

    it("Should update marketplace fee", async function () {
      const newFee = 300; // 3%

      await expect(marketplaceContract.updateMarketplaceFee(newFee))
        .to.emit(marketplaceContract, "MarketplaceFeeUpdated")
        .withArgs(250, newFee);

      expect(await marketplaceContract.getMarketplaceFee()).to.equal(newFee);
    });

    it("Should update fee collector", async function () {
      const newFeeCollector = buyer.address;

      await expect(marketplaceContract.updateFeeCollector(newFeeCollector))
        .to.emit(marketplaceContract, "FeeCollectorUpdated")
        .withArgs(feeCollector.address, newFeeCollector);

      expect(await marketplaceContract.getFeeCollector()).to.equal(
        newFeeCollector
      );
    });

    it("Should revert when non-owner tries to update RWAAssetContract", async function () {
      const newRWAAssetContract = await (
        await ethers.getContractFactory("RWAAssetContract")
      ).deploy("New RWA", "NRWA") as unknown as RWAAssetContract;

      await expect(
        marketplaceContract
          .connect(buyer)
          .updateRWAAssetContract(await newRWAAssetContract.getAddress())
      ).to.be.revertedWithCustomError(
        marketplaceContract,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when non-owner tries to update marketplace fee", async function () {
      await expect(
        marketplaceContract.connect(buyer).updateMarketplaceFee(300)
      ).to.be.revertedWithCustomError(
        marketplaceContract,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when non-owner tries to update fee collector", async function () {
      await expect(
        marketplaceContract.connect(buyer).updateFeeCollector(buyer.address)
      ).to.be.revertedWithCustomError(
        marketplaceContract,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert when trying to set fee above 10%", async function () {
      const tooHighFee = 1001; // 10.01%

      await expect(
        marketplaceContract.updateMarketplaceFee(tooHighFee)
      ).to.be.revertedWith("MarketplaceContract: Fee cannot exceed 10%");
    });
  });
});