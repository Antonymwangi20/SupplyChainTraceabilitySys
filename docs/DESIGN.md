# Supply Chain Traceability System

## Design, Guarantees, Limitations, and Threat Model

### 1. Purpose and Scope

This system provides a **tamper-evident, append-only audit trail** for supply chain events across multiple independent parties (manufacturers, distributors, retailers, inspectors).

It is **not** designed to:

* Prove physical authenticity with certainty
* Replace ERP systems
* Prevent all fraud

It **is** designed to:

* Make fraud detectable
* Make tampering expensive
* Provide a shared source of truth where no single party is trusted

The blockchain is used as a **coordination and verification layer**, not a database.

---

### 2. System Architecture Overview

#### Components

1. **Smart Contracts (Ethereum-compatible L2)**

   * Define roles, batches, products, and state transitions
   * Enforce authorization, staking, and invariants
   * Emit events as the authoritative audit log

2. **Indexing Layer (The Graph)**

   * Indexes contract events
   * Provides efficient querying of product and transfer history
   * Eliminates on-chain storage of large histories

3. **Relayer Service (Meta-transactions)**

   * Submits transactions on behalf of users
   * Pays gas fees
   * Enforces rate limits and replay protection

4. **Frontend Application**

   * Generates signatures
   * Displays indexed history
   * Verifies QR codes and signatures off-chain

5. **Off-chain Storage (IPFS + Pinning)**

   * Stores large artifacts (images, PDFs, sensor data)
   * On-chain stores only content hashes

---

### 3. Trust Model

#### Assumptions

* At least one honest party exists per transfer
* Cryptographic primitives (ECDSA, Keccak) are secure
* Blockchain finality is respected (reorg risk is acceptable)
* Indexers may lag but do not rewrite history

#### Non-assumptions

* Parties are not assumed to be honest
* No assumption of long-term data availability
* No assumption that QR codes cannot be cloned
* No assumption that humans input truthful data

---

### 4. On-chain vs Off-chain Data Boundary

#### On-chain (Authoritative)

* Product ID
* Batch ID
* Current owner
* Current state
* Role assignments
* Stakes and slashing outcomes
* Event log of transfers

#### Off-chain (Non-authoritative)

* Images
* Certificates
* Sensor data
* Shipping manifests
* Location metadata

Off-chain data is referenced via **content hashes**.
Integrity is guaranteed; availability is not.

---

### 5. Core Guarantees

This system guarantees:

1. **Immutability**

   * Once a transfer is recorded and finalized, it cannot be altered or removed.

2. **Attribution**

   * Every action is cryptographically signed by an authorized identity.

3. **Transparency**

   * Anyone can independently verify product history.

4. **Non-repudiation**

   * A signer cannot deny having made a claim once recorded.

5. **Bounded minting**

   * Products cannot exceed batch-defined limits.

---

### 6. Explicit Non-Guarantees

This system does **not** guarantee:

1. **Physical authenticity**

   * A fake product can carry a real QR code.

2. **Truthfulness of claims**

   * Blockchain records claims, not reality.

3. **Data permanence**

   * IPFS content may become unavailable.

4. **Collusion resistance**

   * If all parties collude, false history can be recorded.

5. **Real-time correctness**

   * Indexers and frontends may lag behind chain state.

These limitations are structural, not implementation bugs.

---

### 7. Identity and Access Control

#### Role-based Access Control (RBAC)

Roles are assigned to addresses, not individuals:

* `MANUFACTURER`
* `DISTRIBUTOR`
* `INSPECTOR`
* `ADMIN`

### Key Management Properties

* Multiple keys may represent one organization
* Keys can be rotated without breaking history
* Compromised keys can be revoked

Loss of a private key does **not** invalidate prior history.

---

### 8. Batch and Staking Model

#### Motivation

Prevent infinite fake product creation.

#### Mechanism

* Manufacturer registers a batch with:

  * Maximum unit count
  * Required stake proportional to units
* Each product mint increments batch usage
* Minting beyond batch limit reverts
* Stake is locked until batch lifecycle completes

### Slashing

Stake may be partially or fully slashed if:

* Proven false claims are upheld
* Regulatory or inspector challenges succeed

This converts dishonesty into an economic risk.

---

### 9. Transfer Model

#### Transfer Properties

* Transfers are explicit state transitions
* Require authorization by current owner
* Require receiver confirmation (optional but recommended)
* Emit events instead of storing arrays

#### History Storage

* On-chain: latest state only
* Off-chain: full timeline via indexed events

This ensures constant gas cost regardless of history length.

---

### 10. Meta-Transactions and Gas Policy

#### Problem

Most participants should not manage cryptocurrency.

#### Solution

* Users sign structured messages (EIP-712)
* Relayer verifies signatures off-chain
* Relayer submits transactions and pays gas
* Contract re-verifies signature on-chain

#### Protections

* Nonce-based replay protection
* Per-action gas limits
* Rate limiting at relayer layer

Relayer compromise cannot rewrite history, only delay submissions.

---

### 11. QR Code Integrity Model

#### What QR Codes Prove

* The QR data was signed by a valid key
* The product ID exists on-chain

#### What QR Codes Do Not Prove

* Physical attachment to the correct product
* That the product was not cloned

#### Mitigations

* Signed QR payloads
* On-scan verification against chain state
* Optional secondary verification (NFC, holograms, sensors)

QR codes are **indicators**, not guarantees.

---

### 12. Attack Vectors and Mitigations

#### Fake Product Registration

* **Mitigation:** Batch limits + staking

#### Lost or Stolen Keys

* **Mitigation:** RBAC + key rotation

#### QR Code Cloning

* **Mitigation:** Signature checks + anomaly detection

#### False Transfer Claims

* **Mitigation:** Bonding + challenges + audits

#### Gas Griefing

* **Mitigation:** Relayer verification + gas caps

### Data Unavailability

* **Mitigation:** Multi-pinning + monitoring + slashing

No mitigation fully eliminates risk; they reduce incentives and impact.

---

### 13. Cost Model (Approximate)

* On-chain transfer (L2): low, predictable
* Batch registration: higher (stake locked)
* IPFS pinning: recurring operational cost
* Relayer: fixed monthly infrastructure cost

The system is economically viable if it prevents or detects fraud exceeding operational costs.

---

### 14. Why Blockchain (and When Not)

#### Justified Use

* Multi-party trust boundary
* Regulatory auditability
* No single administrator acceptable

#### Not Justified

* Single-company internal tracking
* High-frequency sensor streams
* Private data requiring secrecy

In those cases, a traditional database is superior.

---

### 15. Failure Modes and Degradation

If components fail:

* **Relayer down:** users can submit transactions directly
* **Indexer lagging:** chain remains source of truth
* **IPFS unavailable:** integrity preserved, data inaccessible
* **Frontend compromised:** users can verify independently

The system degrades gracefully rather than catastrophically.

---

### 16. Design Philosophy

This system optimizes for:

* Verifiability over convenience
* Explicit limits over hidden assumptions
* Economic incentives over blind trust

It treats the blockchain as a **judge**, not an oracle of truth.

---

### 17. Summary

This is a **traceability system**, not a truth machine.

It does not prevent fraud by itself.
It makes fraud **harder, riskier, and easier to detect**.

That is the realistic ceiling of blockchain-based supply chain systems — and that ceiling is still high enough to matter.

---