# Supply Chain Traceability: Security Model & Assumptions

This document outlines the security properties, design decisions, and failure modes of the SupplyChain contract.

---

## 1. Core Security Properties

### ✅ Two-Step Transfer Invariants

**Property**: Ownership never changes without explicit acceptance from the receiver.

- `initiateTransfer(productId, to, location)` creates a **pending state**
- Owner remains unchanged until `acceptTransfer(productId)` is called
- Prevents forced custody: receiver must explicitly accept
- Timeout after `3 days`: sender can cancel or initiate a new transfer
- Auditable: all state changes emit events

**Why it matters**:
- Eliminates rug-pull transfers (e.g., malicious burn address)
- Provides dispute window
- Matches real-world supply chain workflows (packing → shipping → delivery confirmation)

---

### ✅ Stake-Based Accountability

**Property**: Manufacturers post stake; stake is slashed on disputed transfers.

- Stake allocated proportionally per product: `productStake = batchStake / maxUnits`
- Dispute slashes **per-product** stake (not batch-wide)
- Slashing requires admin approval (dispute resolution)
- Remaining stake stays locked on batch

**Why it matters**:
- Creates economic deterrent against fraud
- Isolates damage: one bad product doesn't drain entire batch
- Gives honest actors recourse

**Known limitation**:
- Slashing amount hardcoded at 50% per product
- Consider governance for future adjustments

---

### ✅ Event-Based Provenance

**Property**: Complete supply chain history is queryable from events, not stored on-chain.

- All state changes (mint, transfer, dispute) emit `ProvenanceRecorded` events
- Events include: handler, location, action type, timestamp
- Storage-only model: reduces gas cost, improves scalability
- History reconstructed via event logs (off-chain indexers)

**Why it matters**:
- Immutable: events are part of blockchain history
- Scalable: no unbounded array growth
- Audit-friendly: full chain of custody in events

**Important limitation**:
- **Provenance is event-only; not queryable on-chain**
- On-chain queries (`getProductProvenance`) removed in v2
- Use event logs or subgraph for full history
- This is intentional for gas efficiency

---

### ✅ Relayer Integration (Meta-Transactions)

**Property**: Gasless transfers via trusted relayer infrastructure.

- Whitelist-only: `approveRelayer(address)` (admin)
- EIP-712 signatures: user signs intent, relayer executes
- Nonce tracking: prevents replay
- Deadline enforcement: signatures expire

**Why it matters**:
- UX: end users don't pay gas directly
- Trust explicit: relayer whitelist is transparent
- Safe: signatures are cryptographically bound to nonce + deadline

**Trust model**:
- Relayer is trusted to execute correctly
- Relayer *cannot* change `to` address or location
- Relayer *can* frontrun, but only to same destination

---

## 2. Known Limitations & Tradeoffs

### ⚠️ Batch Stake is Global

While per-product stake is slashed, the pool (batchStake) is shared.

- Late products can't be slashed if stake is depleted
- Consider: escrow per-product upfront, or re-stake after slash
- Current design: acceptable for well-capitalized manufacturers

**Mitigation**: Monitor batch stake level; refund if below threshold.

---

### ⚠️ Disputes are Admin-Controlled

Dispute *raising* is permissionless, but *resolution* requires admin role.

```solidity
raiseDispute(productId, reasonHash)  // Anyone
resolveDispute(productId, winner)    // Admin only
```

- Prevents griefing: spam disputes don't block transfers indefinitely
- **Risk**: admin could resolve unfairly
- **Mitigation**: Use decentralized arbitration layer (Kleros, Aragon)

---

### ⚠️ Transfer Timeout is Fixed (3 Days)

Pending transfers expire after 3 days. After expiry:
- Sender can initiate a new transfer
- Product remains with original owner until accepted
- No automatic refund of stake

**Design rationale**: Encourages timely acceptance, prevents indefinite pending state.

**Consideration**: Make timeout configurable via governance.

---

### ⚠️ No Access Control on Product Metadata

Any manufacturer can mint a `productId` with any `metadataHash`.

- No uniqueness guarantee on IDs or metadata
- Assumes manufacturers are pre-screened
- **Risk**: ID collisions or duplicate products
- **Mitigation**: Use centralized registry (Batch ID → trusted manufacturer)

---

## 3. Threat Model

### Attacks We Mitigate

| Attack | Mitigation |
|--------|-----------|
| **Forced custody** | Two-step transfer |
| **Metadata tampering** | `metadataHash` immutable after mint |
| **Replay attack** | Nonce + deadline in EIP-712 |
| **Relayer frontrunning** | Signature binds to specific receiver & location |
| **Stake griefing** | Per-product slashing cap (50%) |
| **Batch griefing** | Timeout expires old disputes |

### Attacks We Don't Prevent

| Attack | Why | Cost |
|--------|-----|------|
| **Admin corruption** | Trust assumption | Medium: requires governance override |
| **Relayer frontrunning to same dest** | Signature allows any relayer | Low: transfer still reaches receiver |
| **DDoS via dispute spam** | Requires admin to resolve | Medium: slows down transfers |
| **Manufacturer Sybil** | No on-chain identity | Medium: off-chain governance |

---

## 4. Failure Modes

### 🔴 Scenario: Stake Depleted Mid-Batch

**Condition**: Multiple disputes slash stake to zero before all products transfer.

**Consequence**: Later products can't slash on dispute.

**Recovery**: Admin can:
1. Manually resolve remaining disputes without slashing
2. Recover products via manual intervention
3. Refund users via DAO treasury

**Prevention**: Monitor stake levels; implement low-water alerts.

---

### 🔴 Scenario: Relayer Goes Offline

**Condition**: Only approved relayer is unavailable.

**Consequence**: Users can't execute gasless transfers.

**Recovery**:
1. Approve backup relayer via admin
2. Users fall back to direct transfers (gas cost)
3. Relayer network should be decentralized

---

### 🔴 Scenario: Dispute Timeout Collision

**Condition**: Transfer pending for >3 days, then disputed.

**Consequence**: Sender can initiate new transfer before acceptance; dispute becomes stale.

**Recovery**: Dispute resolver should check timestamps; resolve fairly based on intent.

**Prevention**: Dispute within timeout window; don't delay arbitration.

---

## 5. Audit Checklist

Before mainnet deployment:

- [ ] Access control on all privileged functions (roles)
- [ ] Reentrancy protection (non-reentrant for ETH transfers)
- [ ] Integer overflow/underflow (using Solidity 0.8+)
- [ ] Event integrity (all state changes emit)
- [ ] Signature validation (EIP-712 correct)
- [ ] Dispute slashing logic (per-product, not global)
- [ ] Transfer timeout enforcement (checked in accept)
- [ ] Relayer whitelist usage (only approved relayers)
- [ ] Emergency pause mechanism (consider for upgrade)

---

## 6. Gas Optimization Notes

**Current optimizations**:
- Event-only provenance (no unbounded arrays)
- `unchecked` nonce increments (safe due to monotonicity)
- Enum for batch status (compact vs string)
- Per-product stake tracking (minimal overhead)

**Future optimizations**:
- Use `PUSH0` opcode (EVM Shanghai+)
- Batch operations for multi-product minting
- Lazy initialization of Dispute struct

---

## 7. Contact & Reporting

For security concerns:
- **Public**: Open issue on GitHub
- **Private**: [security@example.com](mailto:security@example.com)
- **Bug Bounty**: [bounty.example.com](https://bounty.example.com)

---

## Versioning

- **v1.0** (2026-02-06): Initial release
  - Two-step transfers
  - Stake-based slashing
  - Event-only provenance
  - Relayer integration
  - Dispute resolution

---
