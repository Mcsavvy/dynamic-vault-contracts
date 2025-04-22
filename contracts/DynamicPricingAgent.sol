// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./RWAAssetContract.sol";

/**
 * @title DynamicPricingAgent
 * @dev Contract for AI-driven price oracle and on-chain sync
 */
contract DynamicPricingAgent is AccessControl {
    // Role definitions
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // RWAAssetContract interface
    RWAAssetContract private _rwaAssetContract;
    
    // Price update log structure
    struct PriceUpdate {
        uint256 tokenId;
        uint256 oldPrice;
        uint256 newPrice;
        uint256 timestamp;
        string dataSource;
        uint8 confidenceScore; // 0-100 scale
    }
    
    // Mapping of token ID to array of price updates
    mapping(uint256 => PriceUpdate[]) private _priceUpdateHistory;
    
    // Maximum number of price updates to store per token
    uint256 private constant MAX_HISTORY_LENGTH = 100;
    
    // Events
    event PriceUpdated(uint256 indexed tokenId, uint256 oldPrice, uint256 newPrice, uint256 timestamp, string dataSource, uint8 confidenceScore);
    event RWAAssetContractUpdated(address indexed oldContract, address indexed newContract);
    event MinimumConfidenceScoreUpdated(uint8 oldScore, uint8 newScore);
    
    // Minimum confidence score required for a price update (0-100)
    uint8 private _minimumConfidenceScore = 70;
    
    /**
     * @dev Constructor
     * @param admin Address of the admin
     * @param rwaAssetContractAddress Address of the RWAAssetContract
     */
    constructor(address admin, address rwaAssetContractAddress) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        
        _rwaAssetContract = RWAAssetContract(rwaAssetContractAddress);
    }
    
    /**
     * @dev Updates the RWAAssetContract address
     * @param rwaAssetContractAddress New address of the RWAAssetContract
     */
    function updateRWAAssetContract(address rwaAssetContractAddress) external onlyRole(ADMIN_ROLE) {
        address oldContract = address(_rwaAssetContract);
        _rwaAssetContract = RWAAssetContract(rwaAssetContractAddress);
        emit RWAAssetContractUpdated(oldContract, rwaAssetContractAddress);
    }
    
    /**
     * @dev Updates the minimum confidence score required for a price update
     * @param newScore New minimum confidence score (0-100)
     */
    function updateMinimumConfidenceScore(uint8 newScore) external onlyRole(ADMIN_ROLE) {
        require(newScore <= 100, "DynamicPricingAgent: Confidence score must be between 0 and 100");
        uint8 oldScore = _minimumConfidenceScore;
        _minimumConfidenceScore = newScore;
        emit MinimumConfidenceScoreUpdated(oldScore, newScore);
    }
    
    /**
     * @dev Updates the price of a token
     * @param tokenId ID of the token
     * @param newPrice New price of the token
     * @param dataSource Source of the data for the price update
     * @param confidenceScore Confidence score of the price update (0-100)
     */
    function updatePrice(
        uint256 tokenId, 
        uint256 newPrice, 
        string calldata dataSource, 
        uint8 confidenceScore
    ) external onlyRole(ORACLE_ROLE) {
        require(confidenceScore >= _minimumConfidenceScore, "DynamicPricingAgent: Confidence score below minimum");
        require(confidenceScore <= 100, "DynamicPricingAgent: Confidence score must be between 0 and 100");
        
        uint256 oldPrice = _rwaAssetContract.getPrice(tokenId);
        
        // Update price in RWAAssetContract
        _rwaAssetContract.updatePrice(tokenId, newPrice);
        
        // Record price update in history
        PriceUpdate memory update = PriceUpdate({
            tokenId: tokenId,
            oldPrice: oldPrice,
            newPrice: newPrice,
            timestamp: block.timestamp,
            dataSource: dataSource,
            confidenceScore: confidenceScore
        });
        
        // Store update in history, removing oldest if needed
        if (_priceUpdateHistory[tokenId].length >= MAX_HISTORY_LENGTH) {
            // Create a new array and copy over the last n-1 elements
            PriceUpdate[] memory tempUpdates = new PriceUpdate[](_priceUpdateHistory[tokenId].length);
            for (uint256 i = 1; i < _priceUpdateHistory[tokenId].length; i++) {
                tempUpdates[i-1] = _priceUpdateHistory[tokenId][i];
            }
            tempUpdates[tempUpdates.length - 1] = update;
            
            // Clear the original array and repopulate
            delete _priceUpdateHistory[tokenId];
            for (uint256 i = 0; i < tempUpdates.length; i++) {
                _priceUpdateHistory[tokenId].push(tempUpdates[i]);
            }
        } else {
            _priceUpdateHistory[tokenId].push(update);
        }
        
        emit PriceUpdated(tokenId, oldPrice, newPrice, block.timestamp, dataSource, confidenceScore);
    }
    
    /**
     * @dev Gets the latest price update for a token
     * @param tokenId ID of the token
     * @return The latest price update
     */
    function getLatestPriceUpdate(uint256 tokenId) external view returns (PriceUpdate memory) {
        require(_priceUpdateHistory[tokenId].length > 0, "DynamicPricingAgent: No price updates for this token");
        return _priceUpdateHistory[tokenId][_priceUpdateHistory[tokenId].length - 1];
    }
    
    /**
     * @dev Gets the price update history for a token
     * @param tokenId ID of the token
     * @param offset Starting index of the history to retrieve
     * @param limit Maximum number of records to retrieve
     * @return Array of price updates
     */
    function getPriceUpdateHistory(
        uint256 tokenId, 
        uint256 offset, 
        uint256 limit
    ) external view returns (PriceUpdate[] memory) {
        uint256 historyLength = _priceUpdateHistory[tokenId].length;
        
        if (historyLength == 0 || offset >= historyLength) {
            return new PriceUpdate[](0);
        }
        
        uint256 actualLimit = limit;
        if (offset + actualLimit > historyLength) {
            actualLimit = historyLength - offset;
        }
        
        PriceUpdate[] memory result = new PriceUpdate[](actualLimit);
        for (uint256 i = 0; i < actualLimit; i++) {
            result[i] = _priceUpdateHistory[tokenId][offset + i];
        }
        
        return result;
    }
    
    /**
     * @dev Gets the RWAAssetContract address
     * @return The RWAAssetContract address
     */
    function getRWAAssetContract() external view returns (address) {
        return address(_rwaAssetContract);
    }
    
    /**
     * @dev Gets the minimum confidence score required for a price update
     * @return The minimum confidence score
     */
    function getMinimumConfidenceScore() external view returns (uint8) {
        return _minimumConfidenceScore;
    }
} 