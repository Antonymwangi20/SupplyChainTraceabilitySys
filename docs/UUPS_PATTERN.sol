// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SupplyChainV2Upgradeable (Reference Pattern)
 * @notice This file demonstrates the UUPSProxy upgrade pattern for SupplyChain.
 * 
 * KEY INVARIANTS FOR UPGRADES:
 * 1. Storage layout must never be reordered (always append new fields)
 * 2. Never delete contract functions
 * 3. Admin role becomes 3-of-5 Gnosis Safe (not EOA)
 * 4. All critical ops require Safe proposal + vote + execution
 * 
 * DEPLOYMENT FLOW:
 * 1. Deploy SupplyChainV2 (implementation)
 * 2. Deploy SupplyChainProxy pointing to V2
 * 3. Initialize proxy with admin = Gnosis Safe address
 * 4. Transfer ownership to Safe
 * 
 * UPGRADE FLOW:
 * 1. Deploy SupplyChainV3 (new implementation)
 * 2. Create Safe proposal: "authorizeUpgrade(V3 address)"
 * 3. Safe signers vote (need 3/5)
 * 4. Execute: upgradeTo(V3)
 * 5. V3.__gap and storage layout verified
 */

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @notice Pattern for SupplyChainV2 (actual implementation in v2 migration)
 */
abstract contract SupplyChainV2Upgradeable is
    Initializable,
    AccessControlUpgradeable,
    UUPSUpgradeable
{
    // ============ Storage Layout ============
    // DO NOT REORDER EXISTING FIELDS
    
    // V1 fields (must preserve order exactly)
    // mapping(uint256 => Batch) public batches;  // Slot 0-N
    // mapping(uint256 => Product) private products;  // Slot N+1
    // mapping(uint256 => PendingTransfer) private pendingTransfers;  // etc...
    // ... (all original SupplyChain fields)

    // V2 new fields (append only)
    mapping(uint256 => bool) public productFrozen;  // New in V2: products can be frozen by admin
    uint256 public upgradeNonce;  // Track upgrade count
    
    // Governance constants
    uint256 public constant PROPOSAL_DELAY = 2 days;
    
    // ============ Events ============
    event UpgradeAuthorized(address indexed newImplementation, uint256 timestamp);
    event ProductFrozen(uint256 indexed productId, string reason);

    // ============ Initialization ============
    
    /**
     * @notice Initialize V2 upgrade (replaces constructor)
     * Called once via proxy.initialize()
     */
    function initializeV2() public reinitializer(2) {
        upgradeNonce = 0;
        // Add any V2-specific initialization here
    }

    // ============ Authorization & Upgrades ============

    /**
     * @notice Admin function to authorize an upgrade to a new implementation
     * MUST be called via Gnosis Safe (onlyRole(DEFAULT_ADMIN_ROLE))
     */
    function authorizeUpgrade(address newImplementation) 
        public 
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(newImplementation != address(0), "Invalid implementation");
        emit UpgradeAuthorized(newImplementation, block.timestamp);
        upgradeNonce++;
        // Safe's executeTransaction will call upgradeTo() after voting passes
    }

    /**
     * @notice Internal implementation of upgrade (calls authorizeUpgrade first)
     */
    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        // This is called automatically by upgradeTo()
    }

    // ============ V2 New Features ============

    /**
     * @notice Freeze a product (prevents transfers/disputes)
     * Only admin can freeze (i.e., Gnosis Safe)
     */
    function freezeProduct(uint256 productId, string memory reason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        productFrozen[productId] = true;
        emit ProductFrozen(productId, reason);
    }

    /**
     * @notice Unfreeze a product
     */
    function unfreezeProduct(uint256 productId)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        productFrozen[productId] = false;
    }

    /**
     * @notice Gap for future storage additions
     * Reserve 50 slots for future upgrades
     */
    uint256[50] private __gap;
}
