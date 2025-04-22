// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RWAAssetContract
 * @dev Contract for tokenizing real-world assets as NFTs with dynamic pricing
 */
contract RWAAssetContract is ERC721URIStorage, Ownable {
    // Removed: using Counters for Counters.Counter;
    // Removed: Counters.Counter private _tokenIds;
    // Added: Simple counter for token IDs
    uint256 private _nextTokenId = 1;

    // Mapping from token ID to current price
    mapping(uint256 => uint256) private _prices;
    
    // Mapping from token ID to initial price at mint time
    mapping(uint256 => uint256) private _initialPrices;
    
    // Address of the Dynamic Pricing Agent contract that can update prices
    address private _pricingAgent;
    
    // Asset metadata struct
    struct AssetMetadata {
        string name;
        string assetType; // e.g., "Art", "Collectible", "Real Estate"
        string assetLocation;
        uint256 acquisitionDate;
        string description;
        bool isVerified;
    }
    
    // Mapping from token ID to asset metadata
    mapping(uint256 => AssetMetadata) private _assetMetadata;
    
    // Events
    event AssetMinted(uint256 indexed tokenId, string tokenURI, uint256 initialPrice, address owner);
    event PriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice);
    event PricingAgentUpdated(address indexed oldAgent, address indexed newAgent);
    
    /**
     * @dev Constructor
     * @param name Name of the token collection
     * @param symbol Symbol of the token collection
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}
    
    /**
     * @dev Sets the address of the dynamic pricing agent contract
     * @param pricingAgent Address of the pricing agent contract
     */
    function setPricingAgent(address pricingAgent) external onlyOwner {
        address oldAgent = _pricingAgent;
        _pricingAgent = pricingAgent;
        emit PricingAgentUpdated(oldAgent, pricingAgent);
    }
    
    /**
     * @dev Mints a new RWA token
     * @param to Address of the token owner
     * @param tokenURI URI of the token metadata
     * @param initialPrice Initial price of the asset
     * @param metadata Asset metadata
     * @return tokenId ID of the minted token
     */
    function mint(
        address to, 
        string memory tokenURI, 
        uint256 initialPrice,
        AssetMetadata memory metadata
    ) external onlyOwner returns (uint256) {
        // Removed: _tokenIds.increment();
        // Removed: uint256 tokenId = _tokenIds.current();
        // Added: Use nextTokenId and increment it
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        
        _prices[tokenId] = initialPrice;
        _initialPrices[tokenId] = initialPrice;
        _assetMetadata[tokenId] = metadata;
        
        emit AssetMinted(tokenId, tokenURI, initialPrice, to);
        
        return tokenId;
    }
    
    /**
     * @dev Updates the price of a token
     * @param tokenId ID of the token
     * @param newPrice New price of the token
     */
    function updatePrice(uint256 tokenId, uint256 newPrice) external {
        require(_exists(tokenId), "RWAAssetContract: Token does not exist");
        require(msg.sender == _pricingAgent, "RWAAssetContract: Only pricing agent can update prices");
        
        uint256 oldPrice = _prices[tokenId];
        _prices[tokenId] = newPrice;
        
        emit PriceUpdated(tokenId, oldPrice, newPrice);
    }
    
    /**
     * @dev Gets the current price of a token
     * @param tokenId ID of the token
     * @return The current price of the token
     */
    function getPrice(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "RWAAssetContract: Token does not exist");
        return _prices[tokenId];
    }
    
    /**
     * @dev Gets the initial price of a token
     * @param tokenId ID of the token
     * @return The initial price of the token
     */
    function getInitialPrice(uint256 tokenId) external view returns (uint256) {
        require(_exists(tokenId), "RWAAssetContract: Token does not exist");
        return _initialPrices[tokenId];
    }
    
    /**
     * @dev Gets the asset metadata of a token
     * @param tokenId ID of the token
     * @return The asset metadata
     */
    function getAssetMetadata(uint256 tokenId) external view returns (AssetMetadata memory) {
        require(_exists(tokenId), "RWAAssetContract: Token does not exist");
        return _assetMetadata[tokenId];
    }
    
    /**
     * @dev Gets the address of the pricing agent
     * @return The address of the pricing agent
     */
    function getPricingAgent() external view returns (address) {
        return _pricingAgent;
    }
    
    /**
     * @dev Checks if a token exists
     * @param tokenId ID of the token
     * @return Whether the token exists
     */
    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
} 