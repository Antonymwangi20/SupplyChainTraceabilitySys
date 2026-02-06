# ARCHITECTURE.md

**System Architecture and Data Flow**

## 1. Architectural Goals

This architecture is designed to:

* Operate across **multiple mutually distrustful organizations**
* Maintain a **single, tamper-evident source of record**
* Minimize on-chain state and gas costs
* Degrade safely under partial failures
* Avoid forcing end users to manage cryptocurrency

The system favors **verifiability over convenience** and **bounded risk over false guarantees**.

---

## 2. High-Level Architecture

```
┌────────────────────────────┐
│        Frontend App        │
│ (QR Scan, Sign, Display)   │
└────────────┬───────────────┘
             │
             │ Signed messages / Queries
             │
┌────────────▼───────────────┐
│        Relayer API         │
│ (Verify, Rate-limit, Pay) │
└────────────┬───────────────┘
             │
             │ Transactions
             │
┌────────────▼───────────────┐
│   Smart Contracts (L2)     │
│ (State, Rules, Events)    │
└────────────┬───────────────┘
             │
             │ Events
             │
┌────────────▼───────────────┐
│       Indexer (Graph)     │
│ (Query & Aggregation)     │
└────────────┬───────────────┘
             │
             │ GraphQL
             │
┌────────────▼───────────────┐
│        Frontend App        │
└────────────────────────────┘
```

The blockchain is the **source of truth**, not the center of the user experience.

---

## 3. Component Responsibilities

### 3.1 Smart Contracts

**Responsibilities**

* Enforce authorization and roles
* Enforce batch limits and staking
* Maintain current product state
* Emit events as immutable history

**Non-responsibilities**

* Data storage beyond minimal state
* Business logic requiring iteration
* Identity recovery
* User experience

**Design principle:**
Contracts act as a **deterministic judge**, not an oracle of truth.

---

### 3.2 Relayer Service

**Responsibilities**

* Accept signed user intents
* Verify signatures and nonces off-chain
* Enforce gas limits and rate limits
* Submit transactions and pay gas

**Non-responsibilities**

* Interpreting business truth
* Storing authoritative history
* Forging or modifying user intent

**Trust model**

* Relayer may fail or go offline
* Relayer cannot forge valid transactions
* Relayer compromise affects availability, not integrity

---

### 3.3 Indexing Layer (The Graph)

**Responsibilities**

* Index contract events
* Provide historical views and timelines
* Enable fast, paginated queries

**Non-responsibilities**

* Enforcing correctness
* Writing or modifying state

**Trust model**

* Indexer data is advisory
* Blockchain remains authoritative

---

### 3.4 Frontend Application

**Responsibilities**

* Generate cryptographic signatures
* Display indexed data
* Verify QR payloads
* Provide fallback on-chain verification

**Non-responsibilities**

* Custody of funds
* Enforcing protocol rules
* Maintaining authoritative state

**Threat posture**

* Treated as untrusted
* Users may verify data independently

---

### 3.5 Off-Chain Storage (IPFS)

**Responsibilities**

* Store large artifacts
* Provide content-addressed retrieval

**Non-responsibilities**

* Long-term availability guarantees
* Authenticity verification

**Integrity**

* Guaranteed via on-chain hash references

---

## 4. Trust Boundaries

```
User ──┬── Frontend ──┬── Relayer ──┬── Blockchain
       │              │             │
       │              │             └── Immutable
       │              │
       │              └── Untrusted
       │
       └── Untrusted
```

Only the blockchain enforces **hard guarantees**.
Every other component is replaceable or bypassable.

---

## 5. Data Flow Scenarios

### 5.1 Product Registration

1. Manufacturer signs batch registration intent
2. Relayer verifies role and stake
3. Transaction submitted to blockchain
4. Contract validates limits and locks stake
5. Event emitted
6. Indexer updates batch state

**Failure modes**

* Relayer down → manufacturer submits directly
* Indexer lag → state still visible on-chain

---

### 5.2 Product Transfer (Meta-Transaction)

1. Owner signs transfer intent (EIP-712)
2. Relayer verifies signature + nonce
3. Relayer submits transaction
4. Contract verifies signature again
5. State updated, event emitted
6. Indexer updates transfer timeline

**Key property:**
Relayer never controls ownership.

---

### 5.3 QR Code Verification

1. User scans QR code
2. Frontend verifies signature off-chain
3. Frontend queries indexer for history
4. Frontend checks on-chain flags
5. Result displayed with confidence indicators

**Fallback**

* Direct chain query if indexer unavailable

---

### 5.4 Challenge / Dispute Flow

1. Inspector submits challenge
2. Evidence hash referenced
3. Contract evaluates challenge rules
4. Stake slashed if challenge succeeds
5. Product flagged permanently

---

## 6. State Management Strategy

### On-chain State

* Minimal, current-only
* Small fixed-size mappings
* No dynamic arrays

### Off-chain State

* Derived from events
* Rebuildable at any time
* Non-authoritative

This ensures predictable gas costs and replayability.

---

## 7. Upgrade and Change Strategy

### Smart Contracts

* Prefer immutability
* No silent upgrades
* Explicit migration contracts if required

### Off-chain Services

* Freely upgradeable
* Backwards-compatible APIs
* Multiple independent deployments possible

Protocol rules change slowly.
Infrastructure changes frequently.

---

## 8. Failure and Degradation Modes

| Component  | Failure     | Effect                   |
| ---------- | ----------- | ------------------------ |
| Frontend   | Down        | Users switch clients     |
| Relayer    | Down        | Direct chain interaction |
| Indexer    | Lagging     | Reduced visibility       |
| IPFS       | Unavailable | Context loss             |
| Blockchain | Halt        | System pause             |

The system **fails soft**, not hard.

---

## 9. Performance Characteristics

* On-chain writes: low frequency, predictable cost
* Reads: mostly off-chain
* Latency: bounded by block finality
* Scalability: linear with number of products

The bottleneck is organizational adoption, not throughput.

---

## 10. Security Posture Summary

* Minimized trusted computing base
* Explicit adversarial assumptions
* Economic disincentives over trust
* Observable failure modes

Security is achieved through **design constraints**, not optimism.

---

## 11. Why This Architecture Works

This architecture acknowledges:

* Humans lie
* Infrastructure fails
* Keys get lost
* Software has bugs

By assuming these failures **up front**, the system remains usable and auditable even when components misbehave.

---

## 12. Final Note

This architecture does not attempt to replace reality with code.

It creates a **shared memory that cannot be quietly rewritten**.

That is enough to change incentives — and that is the only promise it makes.

---