# Multi-Sig Governance Pattern

## Overview

The Supply Chain Traceability contract requires critical operations (dispute resolution, relayer approval, role management) to be governed by a **Gnosis Safe 3-of-5 multisig** instead of a single EOA admin. This document describes the pattern and deployment flow.

## Why Multi-Sig?

- **Single Point of Failure**: EOA admin compromise = total protocol compromise
- **Economic Incentive**: 1.5M+ USD in collateral + dispute slashing requires distributed governance
- **Auditability**: All operations require 3+ independent approvals (on-chain evidence)
- **Timelock Option**: Can add 2-day delay for critical upgrades (emergency exit window)

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Gnosis Safe 3-of-5 (Admin)                     │
│  - 5 signers (e.g., founders, investors)       │
│  - Requires 3+ approvals for any action         │
│  - Nonce-based ordering (prevents front-run)    │
│  - EIP-1271 signed execution (batch txns)       │
└─────────────┬───────────────────────────────────┘
              │
              ├─→ Critical Operations (via Safe proposal):
              │   - resolveDispute() [Highest privilege]
              │   - approveRelayer() [Onboarding]
              │   - grantRole() [Admin delegation]
              │   - upgradeTo() [Contract upgrades]
              │
              └─→ Normal Operations (EOA):
                  - mintProduct() [Manufacturer]
                  - initiateTransfer() [Owner]
                  - acceptTransfer() [Receiver]
                  - raiseDispute() [Any stakeholder]
                  - claimRefund() [Timeout auto-exec]
```

## Critical Operations (Multi-Sig Required)

### 1. Dispute Resolution
**Operation**: `resolveDispute(productId, isManufacturerWinner)`

**Why Multi-Sig**:
- Determines refund vs. slashing (stake at risk)
- Economic impact: Up to 50% of batch stake returned/slashed
- Coordination with Kleros judges / Aragon voting if integrated

**Safe Proposal Flow**:
```
1. Admin detects unresolved dispute (7+ days active)
2. Calls Safe UI: "New Transaction"
   - To: SupplyChain contract
   - Function: resolveDispute
   - Args: productId=123, isWinner=false
3. Safe creates proposal (nonce auto-increment)
4. 3 of 5 signers vote CONFIRM
5. 48 hours pass (timelock)  [OPTIONAL]
6. Safe.executeTransaction() called
7. Contract emits DisputeResolved(productId, winner)
```

**Gas Cost**: ~45k gas (owner calls), executed within Safe batch tx (~200k for 4-5 ops)

### 2. Relayer Approval
**Operation**: `approveRelayer(relayerAddress, maxGasPrice)`

**Why Multi-Sig**:
- Whitelists external service to pay gas on behalf of users
- Prevents unauthorized fee-stealing relayers
- Gas policy affects all protocol users

**Safe Proposal Flow**:
```
1. Relayer operator submits info to core team
2. Safe proposal: approveRelayer(0x1234..., 100 gwei)
3. 3 signers verify relayer code/audit
4. Execute via Safe
5. Relayer now allowed to submit meta-transactions
```

### 3. Role Management
**Operation**: `grantRole(DEFAULT_ADMIN_ROLE, newAdmin)`

**Why Multi-Sig**:
- Adding/removing admins is destructive
- Must maintain exactly 1 Safe as admin (no rogue EOAs)

**Rule**: NEVER call `grantRole()` except during Safe migration (see below)

### 4. Contract Upgrades (Proxy Pattern)
**Operation**: `upgradeTo(newImplementationAddress)`

**Why Multi-Sig**:
- Entire contract logic can be changed
- Must verify new implementation code via audit
- Timelock delay (2 days) gives users escape hatch

**Safe Proposal Flow** (with optional timelock):
```
PHASE 1: Governance
1. Deploy new SupplyChainV2 implementation
2. Audit new code (external firm)
3. Safe proposal: authorizeUpgrade(V2_ADDRESS)
4. 3 signers approve
5. Execution: upgradeTo(V2_ADDRESS)
6. Timelock delay begins (2 days)

PHASE 2: Upgrade Window
7. Users observe new contract code at proxy
8. If code is malicious, they can exit:
   - Withdraw collateral (if not staked)
   - Stop initiating new transfers
9. After 48 hours: New code is "committed"
   (collateral can now be slashed by V2)

PHASE 3: Normal Operations
10. All transactions use V2 logic
11. Storage slots must be compatible
    (see UPGRADEABILITY.md)
```

## Deployment Checklist (Testnet)

### Step 1: Deploy Gnosis Safe (3-of-5)
```bash
# Via Gnosis Safe UI (safe.global)
1. Create account on Sepolia testnet
2. Add 5 signers (test wallets):
   - Founder (key in vault)
   - Investor A
   - Investor B
   - Operations Lead
   - Legal/Compliance
3. Threshold: 3 confirmations required
4. Save Safe address: e.g., 0xabc123...
```

### Step 2: Deploy SupplyChain Contract
```solidity
// scripts/deploy.ts - Updated deployment

const Safe = "0xabc123..."; // Gnosis Safe address

// Deploy implementation
const SupplyChain = await ethers.deployContract("SupplyChain", [
  Safe,  // admin role holder
  operatorAddress,
  relayerAddress
]);

console.log("SupplyChain deployed:", SupplyChain.target);
console.log("Admin:", Safe);
```

### Step 3: Initialize Safe Settings
```bash
1. Safe UI → Settings → Advanced
2. Enable "Module" (optional, for automated dispute resolution)
3. Set timelock delay: 2 days
   - Go to: Manage Custom Rules
   - Add guard: TimelockGuard (optional)
4. Backup safe-related keys to vault
```

### Step 4: Test Multi-Sig Flow
```bash
# On testnet:
1. Mint product (manufacturer EOA) ✓
2. Initiate transfer (owner EOA) ✓
3. Simulate dispute
   - Raise dispute (relayer)
4. Test Safe proposal:
   - Safe owner 1 creates: resolveDispute() proposal
   - Safe owner 2 approves
   - Safe owner 3 confirms + executes
5. Verify on-chain: DisputeResolved event emitted ✓
```

## Mainnet Readiness Checklist

- [ ] 5 signers identified and tested on testnet
- [ ] Hardware wallets (Ledger/Trezor) for all signers
- [ ] Backup keys stored in Shamir-split secret vault
- [ ] Safe deployment audited by external firm
- [ ] Deployment script tested on mainnet fork
- [ ] Timelock delay configured (2 days recommended)
- [ ] Incident response plan documented (who can call what)
- [ ] 1st dispute resolution practiced in staging env
- [ ] Relayer whitelist established (first 3-5 approved)
- [ ] Upgrade authorization flow tested end-to-end

## Security Considerations

### 1. Signer Key Management
```
❌ NEVER:
- Store keys in version control
- Use single hardware wallet for multiple signers
- Share signer keys between team members

✓ DO:
- Use 5 independent hardware wallets (Ledger Nano S+)
- Store mnemonics in Shamir secret-sharing scheme
  (e.g., Vault, Locksmith)
- Test key recovery quarterly
```

### 2. Proposal Execution
```
PROCESS:
1. Core team creates proposal (via Safe UI)
2. Proposal hashed (includes: to, data, value, nonce)
3. Email alert sent to 5 signers with proposal details
4. Signers review code changes (GitHub link)
5. Signers confirm via Safe UI (hardware wallet)
6. Once 3 signatures collected: Execute
7. Proposal nonce incremented (prevents replay)
```

### 3. Emergency Procedures
```
IF ADMIN SAFE COMPROMISED:
1. Immediately pause protocol via `grantRole(PAUSER, emergencySafe)`
2. Deploy new Safe (new 5 signers)
3. Use old Safe to call: grantRole(DEFAULT_ADMIN_ROLE, newSafe)
4. New Safe now controls contract
5. Audit & communication required

IF SIGNER KEY COMPROMISED:
1. Remove signer from Safe (requires 3/5 vote)
2. Add replacement signer
3. New threshold: 3-of-5 still applies
4. No downtime (replacement on-chain in seconds)
```

## Cost Analysis

| Operation | Gas Cost | Safe Overhead | Total | Frequency |
|-----------|----------|---------------|-------|-----------|
| resolveDispute | 45k | 100k (batch) | 145k | ~10/month |
| approveRelayer | 60k | 100k (batch) | 160k | ~2/year |
| upgradeTo | 30k | 100k (batch) | 130k | ~1/year |
| Normal tx (transfer) | 24k | 0 | 24k | ~1000+/month |

**Safe batching**: Multiple operations packed into single executeTransaction saves gas (~100k overhead amortized).

## Integration with Dispute Window

The 7-day dispute window is designed to allow Safe signers time to review evidence and vote:

```
T+0: Dispute raised
T+1-5: Safe signers collect evidence, review claims
T+5: Safe proposal created: resolveDispute()
T+6-7: 3 of 5 signers vote APPROVE
T+7: Safe executes resolution
       → Refund OR Slash triggered

T+7-14: Manufacturer can claim auto-refund (if still eligible)
```

For faster resolution, integrate with **Kleros** (see KLEROS_INTEGRATION.md):
- Kleros judges vote on dispute automatically
- Safe calls resolveDispute with Kleros ruling

## References

- [Gnosis Safe Docs](https://docs.safe.global)
- [EIP-1271 Signature Validation](https://eips.ethereum.org/EIPS/eip-1271)
- [AccessControl Roles](https://docs.openzeppelin.com/contracts/5.0/access-control)
- [UUPSProxy Pattern](UPGRADEABILITY.md)
