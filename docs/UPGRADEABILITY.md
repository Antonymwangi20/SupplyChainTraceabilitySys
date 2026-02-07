# Upgradeability Architecture (UUPSProxy Pattern)

## Problem Statement

Smart contracts are immutable, but supply chain logic may need updates for:
- Bug fixes (discovered during operation)
- Feature additions (new batch types, dispute resolution methods)
- Gas optimization (new Solidity compiler versions)
- Regulatory compliance (KYC/AML integration)

**Solution**: UUPSProxy pattern allows contract logic to be upgraded while preserving state (storage, balances, roles).

## Architecture Overview

```
USER TRANSACTIONS
       ↓
   ┌───────────────────────────────────┐
   │  SupplyChainProxy (Transparent)   │  ← Never changes
   │  - Receives all calls              │
   │  - Delegates to implementation     │
   │  - Stores all state                │
   │  Address: 0xproxy...              │
   └──────────────┬──────────────────────┘
                  │ delegatecall
                  ↓
        ┌─────────────────────────┐
        │ SupplyChainV1 (Logic)   │  ← Can be upgraded
        │ - mintProduct()          │
        │ - initiateTransfer()     │
        │ Address: 0xv1impl...    │
        └─────────────────────────┘

UPGRADE FLOW:
        ┌──────────────────────┐
        │ Deploy SupplyChainV2 │
        │ Address: 0xv2impl... │
        └──────────────────────┘
                  ↓
        (Admin calls)
        proxy.upgradeTo(0xv2impl...)
                  ↓
        ┌─────────────────────────┐
        │ SupplyChainV2 (Logic)   │  ← New implementation
        │ - Previous functions    │
        │ - NEW feature: freezeProduct
        └─────────────────────────┘
```

## Key Properties

### 1. Single Proxy Address (Immutable)
- Users interact with **proxy contract only**
- All data stored in proxy, never moves
- Proxy delegates all calls to implementation
- Proxy address never changes (for UI/wallets)

### 2. Implementation Swappable
- New logic deployed as new contract
- Admin calls `upgradeTo(newImplementation)`
- Proxy's delegatecall target switches
- **Old implementation code discarded** (contract remains deployed)

### 3. Storage Layout Preserved
- **CRITICAL**: Storage slots must never be reordered
- Old data must be readable by new code
- New fields must be appended, never inserted

## Storage Layout Rules

### ❌ FORBIDDEN Changes (Break Upgrades)

```solidity
// ❌ DO NOT DO THIS:

// V1
contract SupplyChainV1 {
    mapping(uint256 => Batch) public batches;      // Slot 0
    mapping(uint256 => Product) public products;   // Slot 1
    uint256 public constant MAX_UNITS = 1000;      // (no storage)
}

// V2 - BROKEN
contract SupplyChainV2 {
    uint256 public constant MAX_UNITS = 2000;      // Reordered!
    mapping(uint256 => Batch) public batches;      // Slot 0 (CORRUPTED: now contains products data)
    mapping(uint256 => Product) public products;   // Slot 1 (CORRUPTED: now contains batches data)
}
```

**Result**: All data is misaligned. `batches[123]` reads garbage.

### ✓ CORRECT Changes (Safe Upgrades)

```solidity
// V1
contract SupplyChainV1 {
    mapping(uint256 => Batch) public batches;      // Slot 0
    mapping(uint256 => Product) public products;   // Slot 1
    address public admin;                          // Slot 2
}

// V2 - CORRECT
contract SupplyChainV2 is UUPSUpgradeable {
    // MUST preserve exact order
    mapping(uint256 => Batch) public batches;      // Slot 0 ✓
    mapping(uint256 => Product) public products;   // Slot 1 ✓
    address public admin;                          // Slot 2 ✓
    
    // NEW fields appended only
    mapping(uint256 => bool) public frozen;        // Slot 3 ✓
    uint256 public upgradeNonce;                   // Slot 4 ✓
    
    // Reserve slots for future fields
    uint256[50] private __gap;                      // Slots 5-54
}
```

## Implementation Checklist

### Phase 1: Preparation (Before Coding)

- [ ] **List all V1 storage variables** with slots:
  ```solidity
  Slot 0: mapping(uint256 => Batch) batches;
  Slot 1: mapping(uint256 => Product) products;
  Slot 2: address admin;
  // ... complete inventory
  ```

- [ ] **Design V2 changes**:
  - What features are being added?
  - Do any require new storage?
  - Can be done without storage (view functions, pure logic)?

- [ ] **Plan new storage** (append only):
  ```solidity
  // V2 additions (slots 3+)
  Slot 3: mapping(uint256 => bool) productFrozen;
  Slot 4: uint256 upgradeNonce;
  ```

- [ ] **Document removals**:
  - Can functions be removed? **Yes** (no storage impact)
  - Example: Remove `oldBuggyFunction()` (OK)

### Phase 2: Implementation

- [ ] **Add UUPSUpgradeable import**:
  ```solidity
  import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
  ```

- [ ] **Preserve all V1 storage** (exact order, no changes):
  ```solidity
  contract SupplyChainV2 is SupplyChainV1, UUPSUpgradeable {
      // Copy-paste V1 storage declarations
      // NO reordering
      mapping(uint256 => Batch) public batches;
      mapping(uint256 => Product) public products;
      address public admin;
      
      // Append new storage
      mapping(uint256 => bool) public frozen;
  }
  ```

- [ ] **Add reinitializer**:
  ```solidity
  function initializeV2() public reinitializer(2) {
      // Run any V2-specific initialization
      // Called via proxy.call() after upgradeTo
  }
  ```

- [ ] **Add authorization function**:
  ```solidity
  function _authorizeUpgrade(address newImplementation)
      internal
      override
      onlyRole(DEFAULT_ADMIN_ROLE)
  {}
  ```

- [ ] **Reserve storage gap** (for future upgrades):
  ```solidity
  uint256[50] private __gap;  // Reserve 50 slots (V2 → V3)
  ```

### Phase 3: Testing

- [ ] **Deploy V1 to testnet**
- [ ] **Populate state** (mint products, create transfers, raise disputes)
- [ ] **Deploy V2 implementation**
- [ ] **Upgrade proxy**: `admin.upgradeTo(V2_address)`
- [ ] **Call reinitializer**: `proxy.initializeV2()`
- [ ] **Verify state preserved**:
  ```bash
  assert(proxy.batches(123).id == oldBatchId)  // ✓
  assert(proxy.products(456).name == oldName)  // ✓
  assert(proxy.products(456).frozen == false)  // ✓ (new field)
  ```
- [ ] **Test new functions**:
  ```bash
  proxy.freezeProduct(456)
  assert(proxy.frozen(456) == true)  // ✓
  ```

### Phase 4: Deployment (Mainnet)

- [ ] **Code audit** (external firm reviews V2)
- [ ] **Safe proposal**: `authorizeUpgrade(V2_address)`
- [ ] **3-of-5 signers approve** (via Gnosis Safe)
- [ ] **Timelock delay** (2 days: users can exit)
- [ ] **Execute**: `safe.upgradeTo(V2_address)`
- [ ] **Monitor**: Watch for errors in logs
- [ ] **Reinitialize**: Call `initializeV2()` if needed
- [ ] **Communicate**: Notify users (Discord, email)

## Common Pitfalls

### 1. Inserting Storage (BREAKS DATA)
```solidity
// ❌ WRONG: Inserted field in middle
contract SupplyChainV2 {
    mapping(uint256 => Batch) batches;         // Slot 0 - still OK
    uint256 public newField;                   // Slot 1 - WRONG! (was products slot)
    mapping(uint256 => Product) products;      // Slot 2 - WRONG! (corrupts products)
}
```
**Fix**: Append only
```solidity
// ✓ CORRECT
contract SupplyChainV2 {
    mapping(uint256 => Batch) batches;         // Slot 0
    mapping(uint256 => Product) products;      // Slot 1
    uint256 public newField;                   // Slot 2 (appended)
}
```

### 2. Changing Variable Types (BREAKS DECODING)
```solidity
// ❌ WRONG: Changed uint256 → uint128
contract SupplyChainV2 {
    uint128 public admin;                      // Was uint256! Slot 2 now half-empty
}
```

### 3. Deleting Storage Variables (DATA LOSS)
```solidity
// ❌ WRONG: Removed a field
contract SupplyChainV1 {
    address admin;                              // Slot 2
}

contract SupplyChainV2 {
    // Just didn't include it? Data inaccessible!
}
```
**Fix**: Keep it, just don't use it
```solidity
// ✓ CORRECT
contract SupplyChainV2 {
    address admin;                              // Slot 2 (preserved, even if unused)
    // New fields appended
}
```

### 4. Removing Functions (ACTUALLY OK)
```solidity
// ✓ FINE: Remove old buggy function
contract SupplyChainV1 {
    function oldBuggyTransfer() { /* has bug */ }
}

contract SupplyChainV2 {
    // Just don't include oldBuggyTransfer()
    // Storage unaffected, callers will get revert
    // This is a breaking API change, but safe storage-wise
}
```

## Gas Costs (Upgrades)

| Operation | Cost | Notes |
|-----------|------|-------|
| Deploy V2 (20k lines) | 2.5M gas | One-time, owner pays |
| upgradeTo(V2) | 20k gas | Safe batches with other ops |
| initializeV2() | Varies | Depends on init logic |
| **User transaction cost** | **Same as V1** | Proxy overhead negligible (~5%) |

**Total upgrade cost**: ~2.5M gas (~$2k at 50 gwei, $250k at peak)

## Timeline (Mainnet Upgrade)

```
T+0: Discovery of bug/feature request
T+1 day: Code design + spec document
T+3 days: V2 implementation complete
T+5 days: Audit firm review starts
T+10 days: Audit complete, fixes applied
T+12 days: Safe proposal created
T+13 days: Signers vote (overnight)
T+14 days: Execute (deploy V2, upgrade proxy)
T+16 days: Timelock expires (users can exit)
T+17 days: V2 committed, normal operation resumes
```

**Total**: ~2 weeks (fast) to ~3 weeks (if audit issues found)

## References

- [OpenZeppelin UUPSUpgradeable](https://docs.openzeppelin.com/contracts/5.0/api/proxy#UUPSUpgradeable)
- [EIP-1822 (UUPS Standard)](https://eips.ethereum.org/EIPS/eip-1822)
- [Storage Layout Collision Detection](https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable)
- [Hardhat Upgrades Plugin](https://docs.openzeppelin.com/hardhat-upgrades/latest)
