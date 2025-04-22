# Dynamic Vault - Smart Contracts

![Dynamic Vault Logo](https://via.placeholder.com/800x200?text=Dynamic+Vault)

## Overview

Dynamic Vault is a decentralized platform for tokenizing and trading real-world assets (RWAs) such as fine art and collectibles with AI-driven dynamic pricing. Built on the Pharos Network, it addresses liquidity challenges in traditional RWA markets by providing real-time price updates based on external market signals.

This repository contains the core smart contracts that power the Dynamic Vault platform.

## Key Features

- **Real-World Asset Tokenization**: Convert physical assets into tradeable NFTs with comprehensive metadata
- **AI-Driven Dynamic Pricing**: Real-time price updates based on external data sources with confidence scoring
- **Secure Marketplace**: Buy and sell tokenized assets with instant settlement
- **Fee Management**: Configurable marketplace fees with customizable fee collection
- **Price History**: Comprehensive tracking of price changes for each asset
- **Role-Based Access Control**: Secure system with dedicated oracle and admin permissions

## Smart Contract Architecture

Dynamic Vault consists of three main smart contracts:

1. **RWAAssetContract (ERC-721)**: Tokenizes real-world assets with metadata and pricing information
2. **DynamicPricingAgent**: Manages price updates from oracle sources with confidence scoring
3. **MarketplaceContract**: Enables listing, buying, and selling of tokenized assets

### Contract Relationships

```
┌──────────────────┐     Updates Price     ┌────────────────────┐
│  RWAAssetContract│◄────────────────────┐ │ DynamicPricingAgent│
└──────────────────┘                     │ └────────────────────┘
         ▲                               │           ▲
         │                               │           │
         │ Transfers                     │ Provides  │ Oracle
         │ Ownership                     │ Price     │ Data
         │                               │ Updates   │
         ▼                               │           ▼
┌───────────────────┐                ┌───────────────────┐
│MarketplaceContract│                │   External Data   │
└───────────────────┘                │     Sources       │
         ▲                           └───────────────────┘
         │
         │ User Interactions
         │
         ▼
┌──────────────────┐
│      Users       │
└──────────────────┘
```

## Prerequisites

- Node.js v20+ and pnpm
- [Hardhat](https://hardhat.org/)
- [MetaMask](https://metamask.io/) or compatible wallet
- Pharos Network connection

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/yourusername/dynamic-vault-contracts.git
cd dynamic-vault-contracts
pnpm install
```

Create a `.env` file with the following content:

```
PRIVATE_KEY=your_private_key_here
PHAROS_RPC_URL=https://rpc.testnet.pharosnetwork.xyz
PHAROS_API_KEY=your_api_key_here
```

## Deployment

Deploy the contracts to the Pharos network:

```bash
npx hardhat run scripts/deploy.ts --network pharos
```

Alternatively, use Hardhat Ignition:

```bash
npx hardhat ignition deploy ignition/modules/DynamicVault.ts --network pharos
```

## Testing

Run comprehensive tests:

```bash
npx hardhat test
```

Run tests with gas reporting:

```bash
REPORT_GAS=true npx hardhat test
```

## Integration Guide

### For DApp Developers

To integrate Dynamic Vault into your decentralized application:

#### 1. Connect to the Contracts

```typescript
import { ethers } from "ethers";
import RWAAssetContractABI from "./abis/RWAAssetContract.json";
import DynamicPricingAgentABI from "./abis/DynamicPricingAgent.json";
import MarketplaceContractABI from "./abis/MarketplaceContract.json";

// Connect to provider
const provider = new ethers.providers.JsonRpcProvider(PHAROS_RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// Connect to contracts
const rwaAssetContract = new ethers.Contract(
  RWA_ASSET_CONTRACT_ADDRESS,
  RWAAssetContractABI,
  signer
);

const dynamicPricingAgent = new ethers.Contract(
  DYNAMIC_PRICING_AGENT_ADDRESS,
  DynamicPricingAgentABI,
  signer
);

const marketplaceContract = new ethers.Contract(
  MARKETPLACE_CONTRACT_ADDRESS,
  MarketplaceContractABI,
  signer
);
```

#### 2. Tokenize a Real-World Asset

```typescript
// Prepare asset metadata
const metadata = {
  name: "Mona Lisa",
  assetType: "Art",
  assetLocation: "Paris, France",
  acquisitionDate: Math.floor(Date.now() / 1000),
  description: "A famous portrait painting by Leonardo da Vinci",
  isVerified: true
};

// Mint a new token
const initialPrice = ethers.utils.parseEther("10");
const tokenURI = "https://metadata.dynamicvault.com/token/1";
const newOwner = "0x123..."; // Address of the token owner

const tx = await rwaAssetContract.mint(
  newOwner,
  tokenURI,
  initialPrice,
  metadata
);
await tx.wait();
const receipt = await tx.wait();
console.log("Token minted:", receipt);
```

#### 3. Update Asset Price (Oracle)

```typescript
// Get the oracle address
const ORACLE_ROLE = await dynamicPricingAgent.ORACLE_ROLE();
const oracleSigner = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

// Update the price
const tokenId = 1;
const newPrice = ethers.utils.parseEther("15");
const dataSource = "AI-Model-v1";
const confidenceScore = 85;

const tx = await dynamicPricingAgent.connect(oracleSigner).updatePrice(
  tokenId,
  newPrice,
  dataSource,
  confidenceScore
);
await tx.wait();
console.log("Price updated");
```

#### 4. List an Asset for Sale

```typescript
// Approve the marketplace to transfer the token
await rwaAssetContract.connect(sellerSigner).approve(
  marketplaceContract.address,
  tokenId
);

// List the asset
const listingPrice = ethers.utils.parseEther("12");
await marketplaceContract.connect(sellerSigner).listAsset(
  tokenId,
  listingPrice
);
console.log("Asset listed for sale");
```

#### 5. Buy an Asset

```typescript
// Purchase the asset
const tx = await marketplaceContract.connect(buyerSigner).buy(
  tokenId,
  { value: listingPrice }
);
await tx.wait();
console.log("Asset purchased");
```

#### 6. Get Asset Price History

```typescript
// Retrieve price update history
const history = await dynamicPricingAgent.getPriceUpdateHistory(
  tokenId,
  0, // offset
  10 // limit
);

console.log("Price history:", history);
```

### For Oracle Providers

To set up an AI-driven price oracle:

1. Obtain admin/oracle permissions:
   ```typescript
   // Grant oracle role (admin only)
   await dynamicPricingAgent.connect(adminSigner).grantRole(
     ORACLE_ROLE,
     oracleAddress
   );
   ```

2. Implement your AI model to generate price updates with confidence scores

3. Submit price updates:
   ```typescript
   async function submitAIPriceUpdate(tokenId, modelPrice, confidenceScore) {
     await dynamicPricingAgent.connect(oracleSigner).updatePrice(
       tokenId,
       ethers.utils.parseEther(modelPrice.toString()),
       "AI-Model-v" + modelVersion,
       confidenceScore
     );
   }
   ```

## Contract Addresses

| Contract | Network | Address |
|----------|---------|---------|
| RWAAssetContract | Pharos Testnet | `0x...` |
| DynamicPricingAgent | Pharos Testnet | `0x...` |
| MarketplaceContract | Pharos Testnet | `0x...` |

## Security

The contracts implement robust security features:
- Role-based access control
- Ownership validation
- Non-reentrant functions
- Comprehensive error handling

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Contact

For questions and support, please open an issue or contact the team at team@dynamicvault.io.

---

Built with ❤️ by THE BULLS Team
