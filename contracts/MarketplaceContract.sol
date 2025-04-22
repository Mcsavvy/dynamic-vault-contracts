// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RWAAssetContract.sol";

/**
 * @title MarketplaceContract
 * @dev Contract for buying and selling RWA tokens with dynamic pricing
 */
contract MarketplaceContract is Ownable, ReentrancyGuard {
    // RWAAssetContract interface
    RWAAssetContract private _rwaAssetContract;
    
    // Structure for listed assets
    struct Listing {
        uint256 tokenId;
        address seller;
        uint256 price;
        bool isActive;
        uint256 listedTimestamp;
    }
    
    // Mapping of token ID to listing
    mapping(uint256 => Listing) private _listings;
    
    // List of all active token IDs
    uint256[] private _activeListings;
    
    // Fee structure
    uint256 private _marketplaceFeePercentage = 250; // 2.5% represented as basis points (1/100 of a percent)
    address private _feeCollector;
    
    // Events
    event AssetListed(uint256 indexed tokenId, address indexed seller, uint256 price, uint256 timestamp);
    event AssetDelisted(uint256 indexed tokenId, address indexed seller, uint256 timestamp);
    event AssetSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, uint256 timestamp);
    event MarketplaceFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);
    event RWAAssetContractUpdated(address indexed oldContract, address indexed newContract);
    
    /**
     * @dev Constructor
     * @param admin Address of the admin
     * @param rwaAssetContractAddress Address of the RWAAssetContract
     * @param feeCollector Address to receive marketplace fees
     */
    constructor(address admin, address rwaAssetContractAddress, address feeCollector) Ownable(admin) {
        _rwaAssetContract = RWAAssetContract(rwaAssetContractAddress);
        _feeCollector = feeCollector;
    }
    
    /**
     * @dev Updates the RWAAssetContract address
     * @param rwaAssetContractAddress New address of the RWAAssetContract
     */
    function updateRWAAssetContract(address rwaAssetContractAddress) external onlyOwner {
        address oldContract = address(_rwaAssetContract);
        _rwaAssetContract = RWAAssetContract(rwaAssetContractAddress);
        emit RWAAssetContractUpdated(oldContract, rwaAssetContractAddress);
    }
    
    /**
     * @dev Updates the marketplace fee percentage
     * @param newFeePercentage New fee percentage in basis points (1/100 of a percent)
     */
    function updateMarketplaceFee(uint256 newFeePercentage) external onlyOwner {
        require(newFeePercentage <= 1000, "MarketplaceContract: Fee cannot exceed 10%");
        uint256 oldFee = _marketplaceFeePercentage;
        _marketplaceFeePercentage = newFeePercentage;
        emit MarketplaceFeeUpdated(oldFee, newFeePercentage);
    }
    
    /**
     * @dev Updates the fee collector address
     * @param newFeeCollector New address to receive marketplace fees
     */
    function updateFeeCollector(address newFeeCollector) external onlyOwner {
        address oldCollector = _feeCollector;
        _feeCollector = newFeeCollector;
        emit FeeCollectorUpdated(oldCollector, newFeeCollector);
    }
    
    /**
     * @dev Lists an asset for sale
     * @param tokenId ID of the token to list
     * @param price Price to list the asset for
     */
    function listAsset(uint256 tokenId, uint256 price) external {
        require(price > 0, "MarketplaceContract: Price must be greater than 0");
        require(_rwaAssetContract.ownerOf(tokenId) == msg.sender, "MarketplaceContract: Only token owner can list");
        require(!_listings[tokenId].isActive, "MarketplaceContract: Asset already listed");
        
        // Ensure marketplace is approved to transfer the token
        require(
            _rwaAssetContract.getApproved(tokenId) == address(this) || 
            _rwaAssetContract.isApprovedForAll(msg.sender, address(this)),
            "MarketplaceContract: Marketplace not approved to transfer token"
        );
        
        // Create listing
        _listings[tokenId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            price: price,
            isActive: true,
            listedTimestamp: block.timestamp
        });
        
        // Add to active listings
        _activeListings.push(tokenId);
        
        emit AssetListed(tokenId, msg.sender, price, block.timestamp);
    }
    
    /**
     * @dev Removes an asset from sale
     * @param tokenId ID of the token to delist
     */
    function delistAsset(uint256 tokenId) external {
        require(_listings[tokenId].isActive, "MarketplaceContract: Asset not listed");
        require(_listings[tokenId].seller == msg.sender, "MarketplaceContract: Only seller can delist");
        
        // Mark as inactive
        _listings[tokenId].isActive = false;
        
        // Remove from active listings
        _removeFromActiveListings(tokenId);
        
        emit AssetDelisted(tokenId, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Buys an asset
     * @param tokenId ID of the token to buy
     */
    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = _listings[tokenId];
        require(listing.isActive, "MarketplaceContract: Asset not listed");
        
        // Check if the current owner is still the seller
        address currentOwner = _rwaAssetContract.ownerOf(tokenId);
        require(currentOwner == listing.seller, "MarketplaceContract: Seller no longer owns the asset");
        
        // Check if the sent value is enough to cover the price
        require(msg.value >= listing.price, "MarketplaceContract: Insufficient funds");
        
        // Calculate fees
        uint256 fee = (listing.price * _marketplaceFeePercentage) / 10000;
        uint256 sellerProceeds = listing.price - fee;
        
        // Mark as inactive
        _listings[tokenId].isActive = false;
        
        // Remove from active listings
        _removeFromActiveListings(tokenId);
        
        // Transfer token to buyer
        _rwaAssetContract.safeTransferFrom(listing.seller, msg.sender, tokenId);
        
        // Transfer funds to seller
        (bool success, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(success, "MarketplaceContract: Failed to send funds to seller");
        
        // Transfer fee to fee collector
        if (fee > 0) {
            (bool feeSuccess, ) = payable(_feeCollector).call{value: fee}("");
            require(feeSuccess, "MarketplaceContract: Failed to send fee to collector");
        }
        
        // Refund excess payment
        if (msg.value > listing.price) {
            (bool refundSuccess, ) = payable(msg.sender).call{value: msg.value - listing.price}("");
            require(refundSuccess, "MarketplaceContract: Failed to refund excess payment");
        }
        
        emit AssetSold(tokenId, listing.seller, msg.sender, listing.price, block.timestamp);
    }
    
    /**
     * @dev Removes a token ID from the active listings array
     * @param tokenId ID of the token to remove
     */
    function _removeFromActiveListings(uint256 tokenId) private {
        for (uint256 i = 0; i < _activeListings.length; i++) {
            if (_activeListings[i] == tokenId) {
                // Replace with the last element and pop
                _activeListings[i] = _activeListings[_activeListings.length - 1];
                _activeListings.pop();
                break;
            }
        }
    }
    
    /**
     * @dev Gets a listing by token ID
     * @param tokenId ID of the token
     * @return The listing information
     */
    function getListing(uint256 tokenId) external view returns (Listing memory) {
        return _listings[tokenId];
    }
    
    /**
     * @dev Gets all active listings
     * @return Array of active listings
     */
    function getActiveListings() external view returns (Listing[] memory) {
        Listing[] memory activeListings = new Listing[](_activeListings.length);
        for (uint256 i = 0; i < _activeListings.length; i++) {
            activeListings[i] = _listings[_activeListings[i]];
        }
        return activeListings;
    }
    
    /**
     * @dev Gets the marketplace fee percentage
     * @return The marketplace fee percentage in basis points
     */
    function getMarketplaceFee() external view returns (uint256) {
        return _marketplaceFeePercentage;
    }
    
    /**
     * @dev Gets the fee collector address
     * @return The fee collector address
     */
    function getFeeCollector() external view returns (address) {
        return _feeCollector;
    }
    
    /**
     * @dev Gets the RWAAssetContract address
     * @return The RWAAssetContract address
     */
    function getRWAAssetContract() external view returns (address) {
        return address(_rwaAssetContract);
    }
} 