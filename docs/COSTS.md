# COSTS.md

## Blockchain-Based Voting / Supply Chain Traceability System

This document breaks down **development, infrastructure, and operational costs**, with a focus on Ethereum-compatible networks. Numbers are approximate and meant for **engineering decisions**, not marketing decks.

---

## 1. Cost Categories Overview

Costs fall into four buckets:

* Smart contract deployment & execution (gas)
* Off-chain infrastructure
* Development & maintenance
* User interaction costs

Blockchain does **not** eliminate costs — it moves them around.

---

## 2. On-Chain Costs (Gas Fees)

### 2.1 Smart Contract Deployment (One-Time)

| Network          | Avg Deployment Cost |
| ---------------- | ------------------- |
| Ethereum Mainnet | $50 – $300          |
| Polygon          | <$1                 |
| Base / Arbitrum  | $2 – $10            |

Deployment happens once per contract version.

**Reality:**
Mainnet is expensive but maximally secure. L2s are cheaper and good enough for most real systems.

---

### 2.2 Transaction Costs (Per Action)

#### Voting System

* 1 vote = 1 transaction

| Network          | Cost per Vote |
| ---------------- | ------------- |
| Ethereum Mainnet | $1 – $10      |
| Polygon          | <$0.01        |
| Base / Arbitrum  | $0.05 – $0.20 |

#### Supply Chain System

* Product registration
* Ownership transfer
* Status update

| Action            | Avg Cost (Polygon) |
| ----------------- | ------------------ |
| Register product  | <$0.01             |
| Transfer custody  | <$0.01             |
| Verification read | Free (read-only)   |

**Key insight:**
Reads are free. Writes cost gas. Design around that.

---

## 3. Off-Chain Infrastructure Costs

Blockchain stores **proof**, not bulk data.

### 3.1 Backend Server

Used for:

* User onboarding
* Identity verification
* API aggregation
* Rate limiting

| Service                      | Monthly Cost |
| ---------------------------- | ------------ |
| VPS (2–4GB RAM)              | $5 – $20     |
| Managed backend (Render/Fly) | $7 – $25     |

---

### 3.2 IPFS / Decentralized Storage

Used for:

* Documents
* Certificates
* Metadata

| Storage Size | Cost      |
| ------------ | --------- |
| <5GB         | Free – $5 |
| 50GB         | $10 – $20 |

Only **hashes** go on-chain.

---

## 4. Development Costs (Time = Money)

Assuming a small team or solo dev.

### Initial Development

| Task             | Time      |
| ---------------- | --------- |
| Smart contracts  | 2–4 weeks |
| Backend APIs     | 1–2 weeks |
| Frontend (web)   | 2–3 weeks |
| Testing & audits | 1–2 weeks |

### Security Audit (Optional but serious)

| Level                | Cost             |
| -------------------- | ---------------- |
| Informal peer review | Free             |
| Professional audit   | $2,000 – $10,000 |

Skipping audits is cheaper short-term and catastrophic long-term.

---

## 5. User Cost Model

### Who pays gas?

#### Option A: User Pays

* Simple
* Friction for non-crypto users

#### Option B: Platform Pays (Meta-transactions)

* Better UX
* Platform covers gas
* Requires relayer infrastructure

**Estimated monthly gas (Polygon):**

* 10,000 transactions ≈ $50–$100

---

## 6. Scaling Costs

### Voting

* Costs scale linearly with voters
* L2 or sidechain required beyond small elections

### Supply Chain

* Costs scale with **events**, not users
* Predictable and manageable

Supply chain systems scale **far better** than public voting.

---

## 7. Break-Even Thinking

Blockchain makes sense when:

* Tampering costs more than gas
* Auditability saves human labor
* Trust is expensive off-chain

Bad fit when:

* You control all parties anyway
* Data changes frequently
* Privacy requirements exceed current cryptography

---

## 8. Cost Optimization Strategies

* Use Polygon/Base instead of Ethereum mainnet
* Batch operations where possible
* Keep contracts minimal
* Push everything except proofs off-chain
* Avoid loops in smart contracts

---

## 9. Bottom Line

| System                    | Monthly Cost (Small Scale) |
| ------------------------- | -------------------------- |
| Voting (1k users)         | $10 – $50                  |
| Supply chain (10k events) | $20 – $100                 |

Blockchain isn’t free.
But compared to fraud, disputes, audits, and centralized failure — it’s cheap insurance.