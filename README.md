# Supply Chain Traceability System (Blockchain-Based)

This repository contains a **blockchain-backed supply chain traceability system** designed to provide verifiable, tamper-evident records of product batches and custody transfers across multiple independent parties.

This is **not** a magic anti-counterfeiting solution. It is an **audit and accountability system**. It records claims immutably and makes cheating expensive and detectable.

---

## What this system is

* A **multi-party ledger** for product lifecycle events
* A way to prove *who claimed what, when*
* A dispute-aware custody transfer system
* A bridge between physical goods and cryptographic evidence

Built on:

* **Ethereum-compatible blockchain** (EVM)
* **Solidity smart contracts**
* **Hardhat** for development and testing
* **IPFS** for off-chain metadata
* **Event indexing (The Graph)** for scalable reads
* **Relayer-based meta-transactions** for UX

---

## What this system is NOT

* It does **not** guarantee physical authenticity
* It does **not** prevent lying (it records lies permanently)
* It does **not** replace regulators or inspectors
* It does **not** work without real-world enforcement

If one trusted entity controls all parties, a centralized database would be simpler and cheaper.

---

## Core guarantees

* Immutable audit trail of batch creation and transfers
* Cryptographic proof of authorship (signatures)
* No unilateral history rewriting
* Public verifiability without trusting a central operator

---

## High-level architecture

**On-chain**

* Batch registration with economic stake
* Product minting within batch limits
* Two-step custody transfers (initiate → accept)
* Slashing and dispute hooks

**Off-chain**

* IPFS-hosted metadata (batch docs, certificates)
* Secure QR code generation and verification
* Relayer service for gasless UX
* Indexer for read scalability

---

## Repository structure

```
/
├── hardhat/
│   ├── contracts/
│   │   └── SupplyChainV2.sol
│   ├── scripts/
│   ├── test/
│   ├── hardhat.config.js
│   └── package.json
│
├── relayer/
│   ├── index.js
│   └── googlePayService.ts
│
├── frontend/
│   └── (QR scan + verification UI)
│
├── graph/
│   ├── schema.graphql
│   └── subgraph.yaml
│
├── DESIGN.md
├── ARCHITECTURE.md
└── README.md
```

---

## Key design decisions (locked)

* **Toolchain:** Hardhat
* **Staking:** Native token (economic bonding)
* **Transfers:** Two-step custody handoff
* **Metadata hashes:** `bytes32` (keccak256 of CID string)

These decisions are intentional and threat-model driven.

---

## Threat model (summary)

| Threat              | Mitigation                        |
| ------------------- | --------------------------------- |
| Fake batch creation | Economic stake + batch limits     |
| Forced custody      | Two-step transfers                |
| Key loss            | Role rotation                     |
| QR cloning          | Signed QR + on-chain verification |
| Gas griefing        | Relayer gas caps                  |
| Data loss           | Multi-pinning + hash anchoring    |

---

## Development status

This project is currently:

* Pre-production
* Actively threat-modeled
* Focused on correctness before features

No token launch. No hype roadmap. No shortcuts.

---

## Why blockchain here?

Because:

* Multiple independent parties
* No natural central authority
* Regulatory and audit pressure
* Long-term verifiability matters

If those conditions don’t apply, don’t use this.

---

## License

MIT (subject to change if regulatory constraints require otherwise)
