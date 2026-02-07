# The Graph Subgraph Schema & Indexing

## Overview

The Graph's decentralized indexing network enables real-time querying of blockchain events. The Supply Chain contract emits events that need to be indexed into GraphQL entities for:
- **Dashboard**: Real-time batch status, dispute rates, average resolution time
- **Product Lineage**: Trace product journey (manufacturer → shipper → retailer)
- **Dispute Analytics**: Dispute trends, win rates by manufacturer, average slashing amount
- **Relayer Monitoring**: Gas subsidies paid, signature counts

## Event Indexing Flow

```
Smart Contract Events
        ↓
[ ProductMinted(productId, batchId) ]
        ↓
    Subgraph Handler
        ↓
GraphQL Entities Updated
        ↓
[Product {id, batchId, status, ...}]
        ↓
User Query
        ↓
GET /subgraphs/name/org/supply-chain?query={products{id, status}}
```

## Entities & Schema

### 1. Batch Entity

Represents a collection of products shipped together.

```graphql
type Batch @entity {
  # Immutable fields
  id: ID!                           # batchId (from event)
  manufacturer: Bytes!              # Address (indexed)
  createdAt: BigInt!               # Block timestamp
  
  # Mutable fields
  maxUnits: BigInt!                # Max units per product
  status: BatchStatus!             # ACTIVE, COMPLETED, DISPUTED
  
  # Derived from ProductMinted events
  products: [Product!]! @derivedFrom(field: "batch")
  productCount: Int!               # Total products in batch
  
  # Batch-level statistics
  totalStaked: BigInt!             # Sum of all products' stakes
  totalSlashed: BigInt!            # Sum of slashed amounts
  disputeCount: Int!               # Total disputes raised
  
  # References
  relayer: Relayer                 # Who paid for transactions
  
  # Block info (for reorgs)
  block: Int!
  transactionHash: String!
}

enum BatchStatus {
  ACTIVE
  COMPLETED
  DISPUTED
  RESOLVED
}
```

**Populated by**:
- `BatchCreated(batchId, manufacturer, maxUnits, stake)`
- `ProductMinted(productId, batchId, ...)`
- `DisputeResolved(productId, ...)`

### 2. Product Entity

Individual item within a batch.

```graphql
type Product @entity {
  # Immutable
  id: ID!                              # productId
  batch: Batch!                        # Reference to batch
  serial: String!                      # Unique serial number
  manufacturer: Bytes!                 # Address (indexed)
  origin: String!                      # Country/facility code
  
  # Mutable
  status: ProductStatus!               # MINTED, IN_TRANSIT, DELIVERED, DISPUTED, SLASHED
  currentOwner: Bytes!                 # Current holder
  finalDestination: String!            # Target location
  
  # Lifecycle timestamps
  createdAt: BigInt!                   # When minted
  lastUpdatedAt: BigInt!               # Last transfer/dispute
  deliveredAt: BigInt                  # Null if not delivered
  
  # Stake & Economics
  stake: BigInt!                       # Per-product collateral
  slashed: BigInt!                     # Amount forfeited
  refunded: BigInt!                    # Amount returned
  
  # Transfer tracking
  currentTransfer: Transfer            # Pending transfer (if any)
  transfers: [Transfer!]! @derivedFrom(field: "product")
  
  # Dispute tracking
  activeDispute: Dispute               # Current dispute (if any)
  disputes: [Dispute!]! @derivedFrom(field: "product")
  disputeCount: Int!                   # Total disputes ever
  
  # Block info
  block: Int!
  transactionHash: String!
}

enum ProductStatus {
  MINTED
  IN_TRANSIT
  DELIVERED
  DISPUTED
  SLASHED
  REFUNDED
}
```

**Populated by**:
- `ProductMinted(productId, batchId, serial, origin, ...)`
- `TransferInitiated(productId, owner, receiver, ...)`
- `TransferAccepted(productId, receiver, ...)`
- `DisputeRaised(productId, initiator, ...)`
- `DisputeResolved(productId, winner, ...)`

### 3. Transfer Entity

Represents ownership transfer between parties.

```graphql
type Transfer @entity {
  # Identity
  id: ID!                          # "productId-transferIndex"
  product: Product!                # Reference
  transferNumber: Int!             # 1st, 2nd, 3rd transfer...
  
  # Participants
  from: Bytes!                     # Previous owner
  to: Bytes!                       # New owner
  
  # Timing
  initiatedAt: BigInt!             # Block timestamp
  acceptedAt: BigInt               # Null if pending
  timedOutAt: BigInt               # Null if accepted
  duration: BigInt                 # acceptedAt - initiatedAt
  
  # State
  status: TransferStatus!          # PENDING, ACCEPTED, TIMEDOUT, BLOCKED_BY_DISPUTE
  
  # Associated dispute (if any)
  dispute: Dispute                 # If disputed during transfer
  
  # Block info
  block: Int!
  transactionHash: String!
}

enum TransferStatus {
  PENDING
  ACCEPTED
  TIMEDOUT
  BLOCKED_BY_DISPUTE
}
```

**Populated by**:
- `TransferInitiated(productId, owner, receiver, ...)`
- `TransferAccepted(productId, receiver, ...)`
- `TransferTimedOut(productId, ...)`
- `DisputeRaised(productId, ...)` ← blocks transfer

### 4. Dispute Entity

Conflict resolution.

```graphql
type Dispute @entity {
  # Identity
  id: ID!                          # "productId-disputeIndex"
  product: Product!                # Reference
  disputeNumber: Int!              # 1st, 2nd, 3rd dispute...
  
  # Participants
  initiator: Bytes!                # Who raised dispute (indexed)
  manufacturer: Bytes!             # Product creator
  
  # Evidence & Reasoning
  reason: String!                  # Complaint description
  evidenceHash: String!            # IPFS hash of evidence
  
  # Timing & Resolution
  raisedAt: BigInt!                # Block timestamp
  resolvedAt: BigInt               # Null if pending
  refundDeadline: BigInt!          # resolvedAt + 14 days
  claimedRefundAt: BigInt          # When manufacturer claimed
  
  # Outcome
  status: DisputeStatus!           # ACTIVE, RESOLVED, CLAIMED_REFUND, APPEALED
  manufacturerWon: Boolean         # True = refund, False = slash
  winner: Bytes                    # Who won (if resolved)
  
  # Economics
  stakeInvolved: BigInt!           # Per-product stake at risk
  slashAmount: BigInt              # If manufacturer lost
  refundAmount: BigInt             # If manufacturer won
  
  # Kleros integration (optional)
  kleroId: BigInt                  # If escalated to Kleros
  kleroRuling: Int                 # Kleros verdict (0=buyer, 1=mfg)
  
  # Block info
  block: Int!
  transactionHash: String!
}

enum DisputeStatus {
  ACTIVE
  RESOLVED
  CLAIMED_REFUND
  APPEALED
  ESCALATED_TO_KLEROS
}
```

**Populated by**:
- `DisputeRaised(productId, initiator, reason, ...)`
- `DisputeResolved(productId, winner, slashAmount, ...)`
- `RefundClaimed(productId, timestamp, ...)`
- `DisputeEscalated(productId, kleroId, ...)` ← if Kleros integration

### 5. Relayer Entity

Track relayers who submit meta-transactions.

```graphql
type Relayer @entity {
  # Identity
  id: ID!                          # Relayer address
  
  # Whitelisting
  status: RelayerStatus!           # APPROVED, REVOKED, PAUSED
  approvedAt: BigInt!              # When approved
  maxGasPrice: BigInt!             # Price ceiling
  
  # Economics
  gasSubsidiesDistributed: BigInt! # Total paid to this relayer
  transactionCount: Int!           # Number of meta-txns
  averageGasPrice: BigInt          # avgPrice = total / count
  
  # Statistics
  successfulTxns: Int!             # Txns that succeeded
  failedTxns: Int!                 # Txns that reverted
  successRate: Float!              # (success / total)
  
  # Block info
  block: Int!
  lastActivityAt: BigInt!          # Last transaction
}

enum RelayerStatus {
  APPROVED
  REVOKED
  PAUSED
}
```

**Populated by**:
- `RelayerApproved(relayer, maxGasPrice, ...)`
- `RelayerRevoked(relayer, ...)`
- Meta-transaction signatures (off-chain data, if needed)

### 6. Manufacturer Entity (Aggregated Statistics)

Summary statistics by manufacturer.

```graphql
type Manufacturer @entity {
  # Identity
  id: ID!                          # Manufacturer address
  
  # Batch & Product Stats
  totalBatchesCreated: Int!        # Number of batches
  totalProductsMinted: Int!        # Total products ever
  activeProducts: Int!             # Not yet delivered/slashed
  
  # Dispute Stats
  totalDisputesRaised: Int!        # Disputes where they're initiator
  totalDisputesAgainst: Int!       # Disputes where they're defendant
  disputesWon: Int!                # Resolved in their favor
  disputesLost: Int!               # Resolved against them
  winRate: Float!                  # (won / total)
  
  # Economics
  totalStaked: BigInt!             # Sum of all stakes
  totalSlashed: BigInt!            # Total forfeited
  totalRefunded: BigInt!           # Total recovered
  avgStakePerProduct: BigInt       # total / productCount
  
  # Reputation
  reputation: Float!               # 0.0 - 1.0 (1 - slashRate)
  trustScore: Float!               # Similar to reputation
  
  # Timing
  firstBatchAt: BigInt!            # When started
  lastActivityAt: BigInt!          # Most recent update
}
```

**Populated by**: Aggregated from Batch, Product, Dispute entities

### 7. BridgeContract Entity (For Cross-Chain)

If bridging to other chains (future):

```graphql
type BridgeMessage @entity {
  # Identity
  id: ID!                          # messageId (cross-chain)
  sourceChain: String!             # "ethereum", "polygon", etc
  targetChain: String!             # Destination
  
  # Content
  productId: String!               # Product being bridged
  metadata: String!                # JSON with product details
  
  # Status
  status: BridgeStatus!            # INITIATED, CONFIRMED, FINALIZED
  confirmedAt: BigInt              # When confirmed on target
  
  # Economics
  bridgeFee: BigInt!               # Cost to bridge
  relayedBy: Bytes!                # Who relayed
}

enum BridgeStatus {
  INITIATED
  CONFIRMED
  FINALIZED
  FAILED
}
```

## Handlers (TypeScript Mappings)

### Mapping File Structure

```typescript
// src/mappings.ts

import {
  BatchCreated as BatchCreatedEvent,
  ProductMinted as ProductMintedEvent,
  DisputeRaised as DisputeRaisedEvent,
  DisputeResolved as DisputeResolvedEvent,
} from "../generated/SupplyChain/SupplyChain"

import {
  Batch,
  Product,
  Dispute,
  Transfer,
  Manufacturer,
} from "../generated/schema"

/**
 * Handler: new batch created
 */
export function handleBatchCreated(event: BatchCreatedEvent): void {
  let batch = new Batch(event.params.batchId.toString())
  batch.manufacturer = event.params.manufacturer
  batch.maxUnits = event.params.maxUnits
  batch.createdAt = event.block.timestamp
  batch.status = "ACTIVE"
  batch.productCount = 0
  batch.totalStaked = BigInt.zero()
  batch.totalSlashed = BigInt.zero()
  batch.disputeCount = 0
  batch.block = event.block.number.toI32()
  batch.transactionHash = event.transaction.hash.toHexString()
  batch.save()
}

/**
 * Handler: new product minted
 */
export function handleProductMinted(event: ProductMintedEvent): void {
  let product = new Product(event.params.productId.toString())
  product.batch = event.params.batchId.toString()
  product.serial = event.params.serial.toString()
  product.manufacturer = event.params.manufacturer
  product.origin = event.params.origin
  product.status = "MINTED"
  product.currentOwner = event.params.manufacturer
  product.stake = event.params.stake
  product.createdAt = event.block.timestamp
  product.lastUpdatedAt = event.block.timestamp
  product.slashed = BigInt.zero()
  product.refunded = BigInt.zero()
  product.disputeCount = 0
  product.block = event.block.number.toI32()
  product.transactionHash = event.transaction.hash.toHexString()
  product.save()

  // Update batch stats
  let batch = Batch.load(event.params.batchId.toString())!
  batch.productCount += 1
  batch.totalStaked = batch.totalStaked.plus(event.params.stake)
  batch.save()

  // Update manufacturer stats
  let mfgId = event.params.manufacturer.toHexString()
  let mfg = Manufacturer.load(mfgId)
  if (mfg == null) {
    mfg = new Manufacturer(mfgId)
    mfg.totalBatchesCreated = 0
    mfg.totalProductsMinted = 0
    mfg.totalStaked = BigInt.zero()
  }
  mfg.totalProductsMinted += 1
  mfg.totalStaked = mfg.totalStaked.plus(event.params.stake)
  mfg.save()
}

/**
 * Handler: dispute raised
 */
export function handleDisputeRaised(event: DisputeRaisedEvent): void {
  let disputeId = event.params.productId.toString() + "-" + 
    event.params.disputeNumber.toString()
  
  let dispute = new Dispute(disputeId)
  dispute.product = event.params.productId.toString()
  dispute.initiator = event.params.initiator
  dispute.manufacturer = event.params.manufacturer
  dispute.reason = event.params.reason
  dispute.raisedAt = event.block.timestamp
  dispute.status = "ACTIVE"
  dispute.stakeInvolved = event.params.stake
  dispute.block = event.block.number.toI32()
  dispute.transactionHash = event.transaction.hash.toHexString()
  dispute.save()

  // Update product
  let product = Product.load(event.params.productId.toString())!
  product.activeDispute = disputeId
  product.status = "DISPUTED"
  product.disputeCount += 1
  product.save()
}

/**
 * Handler: dispute resolved
 */
export function handleDisputeResolved(event: DisputeResolvedEvent): void {
  let productId = event.params.productId.toString()
  let product = Product.load(productId)!
  
  let dispute = Dispute.load(product.activeDispute!)!
  dispute.status = "RESOLVED"
  dispute.resolvedAt = event.block.timestamp
  dispute.manufacturerWon = event.params.winner
  dispute.winner = event.params.winner ? 
    product.manufacturer : 
    product.currentOwner

  if (event.params.winner) {
    // Manufacturer won → refund
    dispute.refundAmount = event.params.refundAmount
    product.refunded = product.refunded.plus(event.params.refundAmount)
    product.status = "DELIVERED" // Or restored to previous status
  } else {
    // Manufacturer lost → slash
    dispute.slashAmount = event.params.slashAmount
    product.slashed = product.slashed.plus(event.params.slashAmount)
    product.status = "SLASHED"
  }
  
  dispute.save()
  product.save()
}
```

## Example Queries

### 1. Product Lineage (Track Journey)

```graphql
{
  product(id: "SCT-2024-001") {
    id
    serial
    origin
    finalDestination
    status
    manufacturer {
      id
      reputation
    }
    transfers {
      from
      to
      initiatedAt
      acceptedAt
      status
    }
    disputes {
      initiator
      reason
      status
      manufacturerWon
    }
  }
}
```

**Use case**: Customer traces product from factory → warehouse → retailer

### 2. Dispute Analytics (Dashboard)

```graphql
{
  disputes(
    where: {resolvedAt_not: null}
    orderBy: resolvedAt
    orderDirection: desc
    first: 100
  ) {
    id
    initiator
    manufacturer {
      id
      reputation
    }
    manufacturerWon
    stakeInvolved
    slashAmount
    refundAmount
    resolvedAt
  }
}
```

**Use case**: Admin dashboard showing recent resolutions and trends

### 3. Manufacturer Reputation

```graphql
{
  manufacturer(id: "0x123...") {
    totalProductsMinted
    totalDisputesAgainst
    disputesLost
    winRate
    totalSlashed
    reputation
    firstBatchAt
    lastActivityAt
  }
}
```

**Use case**: Buyer checks manufacturer track record before purchasing

### 4. Relayer Performance

```graphql
{
  relayers(orderBy: successRate, orderDirection: desc) {
    id
    status
    transactionCount
    successRate
    averageGasPrice
    gasSubsidiesDistributed
  }
}
```

**Use case**: Monitor relayer health and optimize gas subsidies

### 5. Batch Status with Products

```graphql
{
  batch(id: "BATCH-2024-Q1") {
    manufacturer {
      id
    }
    productCount
    status
    totalStaked
    totalSlashed
    disputeCount
    products(first: 10) {
      id
      status
      currentOwner
      slashed
    }
  }
}
```

**Use case**: Track batch through supply chain

## Deployment (Testnet)

### 1. Create Subgraph Project

```bash
# From graph-protocol workspace
npm install -g @graphprotocol/graph-cli
graph init --studio supply-chain-traceability

# Navigate to subgraph folder
cd supply-chain-traceability
```

### 2. Define Schema

Copy entities above into `schema.graphql`

### 3. Code Generation

```bash
# Generate TypeScript types from ABI
graph codegen

# This creates `src/types/SupplyChain/SupplyChain.ts`
```

### 4. Write Handlers

Create `src/mappings.ts` with event handlers (see above)

### 5. Deploy to Studio

```bash
# Authenticate
graph auth --studio <DEPLOY_KEY>

# Deploy to testnet
graph deploy --studio supply-chain-traceability \
  --version-label v1.0 \
  --network sepolia

# Access at:
# https://thegraph.com/studio/subgraph/supply-chain-traceability
```

### 6. Test Queries

```bash
# From any client (Node.js, Python, curl)
curl -X POST https://api.studio.thegraph.com/query/... \
  -H "Content-Type: application/json" \
  -d '{"query": "{ products(first: 5) { id } }"}'
```

## Monitoring & Maintenance

- **Sync Status**: Check if subgraph is behind blockchain (lag alert)
- **Query Performance**: Monitor GraphQL response times (target: <100ms)
- **Event Indexing**: Ensure all contract events are mapped to entities
- **Schema Versioning**: When adding new fields, bump version (v1.0 → v1.1)

## References

- [The Graph Documentation](https://thegraph.com/docs/)
- [GraphQL Query Language](https://graphql.org/learn/)
- [Subgraph Manifest](https://thegraph.com/docs/en/developing/creating-a-subgraph/#the-subgraph-manifest)
- [AssemblyScript Guide](https://www.assemblyscript.org/)
