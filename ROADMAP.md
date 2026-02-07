# Supply Chain Protocol — Execution Plan

## Phase 0 — Foundations (DONE ✅)

These are *finished* and correct in design.

### Core protocol

* Two-step product transfer (initiate → accept)
* Strong ownership invariants
* Pending transfer locking
* Dispute blocking during transfer

### Batch system

* Batch registration with stake bonding
* Batch capacity enforcement
* Minting limits per batch
* Batch lifecycle states:

  * `CREATED`
  * `FULLY_MINTED`

### Provenance & auditability

* Provenance events for:

  * `MINTED`
  * `TRANSFER_INITIATED`
  * `TRANSFER_ACCEPTED`
* Timestamps + handler addresses
* Location / metadata hashes included
* Event-driven audit model (indexable)

### Security & access control

* Role-based access control
* Manufacturer-only minting
* Admin-only dispute resolution
* Relayer whitelist

### Meta-transactions

* EIP-712 typed data
* Nonce protection
* Deadline enforcement
* Relayer-executed transfers

### Developer quality

* Custom error types
* SPDX licensing
* Modular contracts
* **All tests passing (14/14)**

Status: **Production-grade core logic**

---

## Phase 1 — Hardening & Corrections (REQUIRED ⚠️)

These must be done before any serious deployment.

### Protocol correctness

* Replace `string` batch status with `enum`
* Fix dispute error misuse (`DisputeNotActive` vs `DisputeAlreadyResolved`)
* Clarify provenance is event-sourced, not storage-backed

### Economic safety

* Fix stake-slashing scope:

  * Prevent one product dispute draining an entire batch
  * Add per-product slash cap or one-time batch slash
* Prevent griefing via repeated disputes

### Transfer lifecycle safety

* Add transfer timeout / expiry
* Allow cancellation after timeout
* Prevent permanent asset freeze

Status: **Blocking for mainnet-like deployment**

---

## Phase 2 — Dispute System Maturity (NOT DONE ❌)

Right now disputes are **admin-resolved only**. That’s fine for v1, but incomplete.

### Needed

* Evidence model (hash-based proofs)
* Dispute phases:

  * Raised
  * Evidence window
  * Resolved
* Optional arbitration integration (future-proofing)
* Provenance entries for dispute lifecycle

Outcome: disputes become **auditable and bounded**, not discretionary.

---

## Phase 3 — Identity & Key Recovery (NOT DONE ❌)

Currently:

* Lost keys = lost control
* That’s unacceptable in supply chains

### Needed

* Role rotation
* Address revocation
* Optional multisig roles (manufacturer / distributor)
* Emergency recovery path (time-locked, auditable)

This is critical for real organizations.

---

## Phase 4 — QR / Physical Binding (NOT DONE ❌)

Blockchain side is ready. Physical world is not.

### Needed

* Signed QR codes (EIP-712 off-chain)
* Nonce or challenge-response on scan
* NFC / hologram / secondary verifier support
* Mismatch detection logic (QR valid ≠ product authentic)

Without this, counterfeiters still win.

---

## Phase 5 — Indexing & Read Model (NOT DONE ❌)

Your contract is already optimized for this — you just haven’t wired it yet.

### Needed

* The Graph (or custom indexer)
* GraphQL schema for:

  * Products
  * Batches
  * Provenance
* Frontend queries **never read storage arrays**

This keeps gas flat forever.

---

## Phase 6 — UX & Relayer Ops (NOT DONE ❌)

Protocol works. Humans still won’t use it.

### Needed

* Relayer service hardening
* Rate limiting
* Gas grief protection
* Monitoring / alerting
* Admin dashboards

Meta-tx without ops discipline is a DoS magnet.

---

## Phase 7 — Documentation & Audit Readiness (NOT DONE ❌)

This is what separates engineers from “crypto builders”.

### Required docs

* `DESIGN.md` (you’re doing this)
* `ARCHITECTURE.md` (done)
* `SECURITY.md` (assumptions + failure modes)
* `THREAT_MODEL.md`
* `KNOWN_LIMITATIONS.md`

Auditors *expect* this now.

---

## Final Reality Check

**You are here:**

> End of Phase 0, entering Phase 1

That already puts you ahead of:

* 90% of blockchain repos
* 99% of “supply chain on blockchain” pitches