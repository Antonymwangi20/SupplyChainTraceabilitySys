# ATTACKS.md

## Adversarial Analysis & Failure Modes

### Purpose

This document enumerates **credible attacks** against the Supply Chain Traceability System.

The goal is not to prove the system is unbreakable.
The goal is to **understand exactly how it breaks**, under what assumptions, and with what blast radius.

If an attack is not listed here, it should be assumed possible.

---

### Threat Model Summary

#### Adversaries Considered

* Dishonest manufacturers
* Dishonest distributors
* External counterfeiters
* Compromised insiders
* Relayer operator compromise
* Curious but honest users
* Coordinated colluding parties

#### Adversaries NOT Considered

* Nation-state attackers against the underlying blockchain
* Cryptographic primitive breaks (ECDSA, Keccak)
* Full L2 consensus failure

---

### Attack 1: Fake Product Over-Minting

#### Goal

Create more on-chain product records than physically produced goods.

#### Method

* Manufacturer registers a batch
* Mints product IDs beyond real-world quantity
* Injects fake items into the supply chain

#### Impact

* Blockchain shows “legitimate” products that never existed
* Counterfeit goods gain apparent legitimacy

#### Mitigation

* Batch-level maximum unit limits
* Mandatory staking proportional to batch size
* Minting beyond batch limit reverts on-chain

#### Residual Risk

* Manufacturer can still lie *within* batch limits
* Requires off-chain auditing to detect discrepancy

**Status:** Mitigated, not eliminated

---

### Attack 2: QR Code Cloning (Most Likely Real-World Attack)

#### Goal

Attach a valid QR code from a real product to a fake product.

#### Method

* Copy QR image from genuine product
* Print or display it on counterfeit goods

#### Impact

* Scans appear valid
* Customer falsely believes product is authentic

#### Mitigation

* QR payload includes cryptographic signature
* Scanner verifies:

  * Signature validity
  * Product ID state
  * Ownership chain
* Optional anomaly detection (duplicate scans, geography mismatch)

#### Residual Risk

* Physical cloning cannot be fully prevented
* Blockchain can only detect inconsistencies, not prevent first deception

**Status:** Detectable, not preventable

---

### Attack 3: False Transfer Claims (Lying on Chain)

#### Goal

Record a transfer that did not happen (e.g., claim 1000 units received instead of 800).

#### Method

* Authorized distributor signs a false claim
* Contract records it immutably

#### Impact

* Permanent false history
* Downstream systems rely on incorrect data

#### Mitigation

* Economic bonding (stake can be slashed)
* Optional dual-signature transfers (sender + receiver)
* Inspector role with challenge capability

#### Residual Risk

* If all parties collude, false claims persist
* Detection depends on external audits or sensors

**Status:** Economically discouraged

---

## Attack 4: Collusion Attack (Hard Limit of the System)

### Goal

Create a fully false but internally consistent supply chain history.

### Method

* Manufacturer, distributor, and retailer collude
* All signatures are “valid”
* No honest party exists to challenge claims

### Impact

* Blockchain records a completely false reality
* No cryptographic contradiction exists

### Mitigation

* None at protocol level
* Only external audits or regulators can detect

### Residual Risk

* This attack is **fundamental and unavoidable**

**Status:** Unmitigated by design
**Note:** This is an explicit system limit

---

## Attack 5: Lost or Compromised Private Keys

### Goal

Use stolen credentials to perform unauthorized actions.

### Method

* Phishing
* Malware
* Insider compromise
* Accidental key loss

### Impact

* Unauthorized transfers
* Reputational and financial damage

### Mitigation

* Role-based access control (RBAC)
* Multiple keys per organization
* Key revocation and rotation
* Optional timelocks for sensitive actions

### Residual Risk

* Actions performed before revocation remain valid
* Cannot retroactively undo history

**Status:** Contained with recovery path

---

## Attack 6: Relayer Abuse or Compromise

### Goal

Drain relayer funds or submit malicious transactions.

### Method

* Send high-gas or replayed signatures
* Abuse open relay endpoints
* Compromise relayer private key

### Impact

* Gas cost loss
* Service downtime
* Denial of service

### Mitigation

* Off-chain signature verification
* Nonce-based replay protection
* Strict gas caps
* Rate limiting
* Relayer key rotation

### Residual Risk

* Relayer outage delays transactions
* Cannot rewrite or forge signatures

**Status:** Operational risk, not integrity risk

---

## Attack 7: Replay Attacks (Meta-Transactions)

### Goal

Reuse a valid signature to execute the same action multiple times.

### Method

* Capture signed payload
* Resubmit through relayer or directly on-chain

### Impact

* Duplicate transfers
* State corruption

### Mitigation

* Per-user nonces stored on-chain
* Signature invalid after first use

### Residual Risk

* None if nonce handling is correct

**Status:** Fully mitigated

---

## Attack 8: Gas Griefing

### Goal

Force relayer to pay excessive gas or fail transactions.

### Method

* Craft signatures triggering expensive execution paths
* Abuse fallback logic

### Impact

* Financial loss
* Relayer shutdown

### Mitigation

* Pre-execution checks off-chain
* Hard gas limits per transaction
* Reject complex payloads

### Residual Risk

* Minor operational overhead

**Status:** Mitigated

---

## Attack 9: Indexer Manipulation / Lag

### Goal

Hide or delay visibility of transfers.

### Method

* Indexer downtime
* Partial indexing
* Frontend querying stale data

### Impact

* Users see outdated or incomplete history
* Confusion, not corruption

### Mitigation

* Blockchain remains source of truth
* Multiple indexers
* Manual on-chain verification fallback

### Residual Risk

* Temporary misinformation

**Status:** Degrades gracefully

---

## Attack 10: Off-Chain Data Loss (IPFS)

### Goal

Make supporting documents unavailable.

### Method

* Stop pinning
* Pinning service failure

### Impact

* Integrity preserved
* Context lost

### Mitigation

* Multi-pinning
* Availability monitoring
* Stake slashing for negligence

### Residual Risk

* Long-term availability not guaranteed

**Status:** Mitigated, not solved

---

## Attack 11: Frontend Compromise

### Goal

Trick users into trusting false information.

### Method

* Malicious frontend deployment
* Tampered API responses

### Impact

* Users misled
* Trust erosion

### Mitigation

* Read-only blockchain verification
* Independent explorers
* Open-source frontend

### Residual Risk

* User education required

**Status:** Externalized risk

---

## Attack 12: Contract Bug (Worst-Case Scenario)

### Goal

Exploit logic flaw in smart contract.

### Method

* Unchecked edge cases
* Incorrect access control
* Arithmetic or state bugs

### Impact

* Funds locked or lost
* Permanent protocol failure

### Mitigation

* Minimal contract surface
* No upgrade-by-default
* Extensive testing
* Third-party audits

### Residual Risk

* Non-zero and permanent

**Status:** Reduced, never eliminated

---

## Summary Table

| Attack Class   | Prevented | Detectable | Mitigated | Fundamental |
| -------------- | --------- | ---------- | --------- | ----------- |
| Fake minting   | ✓         | ✓          | ✓         |             |
| QR cloning     |           | ✓          | ✓         |             |
| False claims   |           | ✓          | ✓         |             |
| Collusion      |           |            |           | ✓           |
| Key compromise |           | ✓          | ✓         |             |
| Relayer abuse  | ✓         | ✓          | ✓         |             |
| Replay attacks | ✓         |            |           |             |
| Gas griefing   | ✓         |            |           |             |
| Data loss      |           | ✓          | ✓         |             |
| Contract bugs  |           |            | ✓         |             |

---

## Final Reality Check

This system **does not create truth**.
It creates **accountability under adversarial conditions**.

If you assume:

* Some parties may lie
* Keys will be lost
* Infrastructure will fail
* Users will make mistakes

Then the system behaves predictably and degrades safely.

If you assume perfect honesty, you don’t need blockchain.

---