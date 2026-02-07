# Kleros Integration for Decentralized Arbitration

## Overview

The Supply Chain contract's 7-day dispute window is designed to work with **Kleros**, a decentralized arbitration protocol. Instead of trusting a single admin to resolve disputes, Kleros allows:
- Transparent dispute evidence submission
- Peer-to-peer juror voting
- Economic incentives for correct rulings
- Appeal mechanism for disagreement

## Architecture

```
DISPUTE LIFECYCLE:

T+0: Manufacturer or buyer raises dispute on-chain
     → SupplyChain.raiseDispute(productId)
     → Dispute state = ACTIVE
     
T+0.5: Parties submit evidence (IPFS links)
     → Kleros.submitEvidence(disputeId, ipfsUri)
     → Evidence list: receipts, inspection reports, photos
     
T+1-5: Jurors review evidence
     → Kleros jurors drawn (randomly from pool)
     → Voting window: 3 days
     → Majority ruling determines outcome
     
T+6: Ruling committed on-chain
     → Kleros.executeRuling(disputeId, winner)
     → SupplyChain contract informed via callback
     
T+6.5: Auto-execute resolution
     → resolveDispute(productId, isManufacturerWinner)
     → Refund OR Slash happens immediately
     
T+7-14: Appeal period (optional)
       OR auto-refund if Kleros ruling disputed
       
END: Dispute terminal state (no re-raising)
```

## Implementation Pattern

### 1. Contract Interface (External)

```solidity
interface IArbitrator {
    function createDispute(
        bytes calldata data,
        string calldata metaEvidence
    ) external payable returns (uint256 disputeId);
    
    function executeRuling(uint256 disputeId) external;
}

interface IArbitrable {
    function rule(uint256 disputeId, uint256 ruling) external;
}
```

### 2. SupplyChain Integration Points

```solidity
contract SupplyChain is IArbitrable {
    // Kleros arbitrator contract
    IArbitrator public arbitrator;
    
    // Map disputes to Kleros IDs
    mapping(uint256 productId => uint256 kleroId) public kleroDisputes;
    
    event DisputeEscalated(
        uint256 indexed productId,
        uint256 indexed kleroId,
        uint256 requiredFee
    );
    
    /**
     * @notice Escalate dispute to Kleros after manual resolution fails
     * Called if dispute unresolved after 7 days
     */
    function escalateToKleros(
        uint256 productId,
        string calldata metaEvidenceUri  // IPFS: case description
    ) external payable {
        Dispute storage d = disputes[productId];
        require(!d.resolved, "Already resolved");
        require(d.active, "Dispute not active");
        require(d.timestamp + DISPUTE_WINDOW < block.timestamp, "Too early");
        
        // Calculate arbitration fee
        uint256 fee = arbitrator.arbitrationCost("");
        require(msg.value >= fee, "Insufficient fee");
        
        // Create Kleros dispute
        uint256 kleroId = arbitrator.createDispute{value: fee}(
            abi.encode(productId, d.manufacturer, d.initiator),
            metaEvidenceUri
        );
        
        kleroDisputes[productId] = kleroId;
        emit DisputeEscalated(productId, kleroId, fee);
    }
    
    /**
     * @notice Kleros arbitrator calls this after voting
     * ruling: 0 = Buyer wins, 1 = Manufacturer wins
     */
    function rule(uint256 disputeId, uint256 ruling) external override {
        require(msg.sender == address(arbitrator), "Only Kleros");
        
        uint256 productId = findProductByKleroId(disputeId);
        require(productId != 0, "Dispute not found");
        
        bool manufacturerWinner = (ruling == 1);
        resolveDispute(productId, manufacturerWinner);
    }
}
```

### 3. Evidence Submission (Off-Chain)

Users submit evidence to Kleros via IPFS-hosted JSON:

```json
{
  "disputeId": 123,
  "productId": "SCT-2024-001",
  "parties": {
    "manufacturer": "0x123...",
    "buyer": "0x456..."
  },
  "evidence": [
    {
      "submitter": "0x123...",
      "timestamp": 1704067200,
      "ipfsHash": "QmAbc...",
      "contentType": "inspection_report",
      "description": "Product arrived with cracked seal"
    },
    {
      "submitter": "0x456...",
      "timestamp": 1704067500,
      "ipfsHash": "QmDef...",
      "contentType": "shipping_receipt",
      "description": "Proof of proper packaging"
    }
  ]
}
```

### 4. Kleros Voting (Juror Side)

Jurors see:
- Product details (batch, origin, destination)
- Competing evidence (buyer's complaint vs. manufacturer's proof)
- Economic stake (refund vs. slashing amount)

Vote: `0 = Buyer right (refund)` or `1 = Manufacturer right (slash buyer)`

Voting incentive: Jurors earn ~25% of loser's deposit for voting with majority

## Cost Analysis

| Step | Payer | Cost | Purpose |
|------|-------|------|---------|
| escalateToKleros | Dispute filer | 60-200 USD | Kleros arbitration fee |
| submitEvidence | Both parties | 5-10 USD | IPFS pinning (optional, if via Kleros) |
| **No additional on-chain cost** | — | 0 | Kleros voting off-chain, final ruling on-chain |

**Benefits over manual admin resolution**:
- Transparent (anyone can review evidence)
- Fair (majority vote, not single person)
- Incentivized (jurors earn fees for correct votes)
- Appeal-able (if disagreement with ruling)

## Comparison: Admin vs. Kleros vs. Aragon

| Aspect | Admin (Safe) | Kleros | Aragon |
|--------|------|--------|--------|
| **Decision Speed** | Fast (1-7 days) | Medium (3-5 days) | Slow (7-14 days) |
| **Cost** | Low (gas only) | Medium (150-200 USD) | Low (gas only) |
| **Transparency** | Moderate (voting visible) | High (all evidence visible) | High (voting visible) |
| **Decentralization** | 3-of-5 signers | Peer jury (63 jurors) | Token holders |
| **Appeal** | None (final) | Yes (costly) | Yes (re-vote) |
| **Best For** | Fast resolution, trust Safe | Contested disputes, fairness critical | Governance votes, DAO treasury |

## Hybrid Approach (Recommended)

```
FAST PATH (Trust Safe, 1-3 days):
├─ Dispute raised
├─ Evidence submitted
├─ Safe proposes resolution
├─ 3-of-5 signers agree quickly
└─ Dispute resolved (refund/slash)

CONTESTED PATH (Escalate to Kleros, if disagreed):
├─ Dispute marked "contested"
├─ escalateToKleros() called
├─ Kleros jurors vote (3 days)
├─ Ruling overrides initial Safe decision
├─ Refund/slash adjusted if needed
└─ Can appeal to Aragon DAO (final) if major economic impact
```

**Implementation**:
1. Start with Safe resolution (for speed)
2. Parties can dispute Safe ruling within 24h
3. If disputed: escalate to Kleros
4. Kleros ruling is binding (DAO can only appeal via governance)

## Deployment Steps (Testnet)

```bash
# 1. Deploy Kleros on testnet (or use existing)
kleros_address="0x..." # (Arbitrum Sepolia Kleros)

# 2. Add to SupplyChain.sol
arbitrator = IArbitrator(kleros_address)

# 3. Test escalation flow
forge test -m testEscalateToKleros

# 4. Deploy meta-evidence (IPFS)
ipfs_uri="ipfs://QmXyz..."  # Dispute rules, refund amounts, etc.

# 5. Raise test dispute + escalate
supplyChain.raiseDispute(productId)
supplyChain.escalateToKleros{value: 0.1 ether}(productId, ipfs_uri)
```

## References

- [Kleros Documentation](https://kleros.io/pdf/Kleros-White-Paper.pdf)
- [IArbitrable Interface](https://github.com/kleros/kleros/blob/master/solidity/contracts/arbitration/Arbitrable.sol)
- [Meta-Evidence JSON Schema](https://kleros.io/meta-evidence-json-schema)
- [Dispute Resolution Best Practices](https://forum.kleros.io/c/arbitration/18)
