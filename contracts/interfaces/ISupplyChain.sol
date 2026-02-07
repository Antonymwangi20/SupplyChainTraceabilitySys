
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISupplyChain {
    event BatchRegistered(uint256 indexed batchId, address indexed manufacturer, uint256 maxUnits, uint256 stake);
    event BatchStatusChanged(uint256 indexed batchId, string status, uint256 timestamp);
    event ProductMinted(uint256 indexed productId, uint256 indexed batchId, address indexed owner, bytes32 metadataHash);
    event TransferInitiated(uint256 indexed productId, address indexed from, address indexed to, bytes32 locationHash);
    event TransferAccepted(uint256 indexed productId, address indexed from, address indexed to);
    event ProvenanceRecorded(uint256 indexed productId, address indexed handler, bytes32 locationHash, string action, uint256 timestamp);
    
    // Dispute events
    event DisputeRaised(uint256 indexed productId, address indexed disputer, string reason, uint256 timestamp);
    event DisputeResolved(uint256 indexed productId, address indexed winner, uint256 slashedAmount, uint256 timestamp);
    
    // Relayer events
    event RelayerApproved(address indexed relayer, bool approved);
    event MetaTxExecuted(address indexed relayer, address indexed user, uint256 nonce);

    function registerBatch(uint256 batchId, uint256 maxUnits) external payable;

    function mintProduct(uint256 productId, uint256 batchId, bytes32 metadataHash) external;

    function initiateTransfer(uint256 productId, address to, bytes32 locationHash) external;

    function acceptTransfer(uint256 productId) external;

    function nonces(address account) external view returns (uint256);

    // Batch tracking queries
    function getBatchStatus(uint256 batchId) external view returns (string memory);
    function getBatchMetadata(uint256 batchId) external view returns (address manufacturer, uint256 maxUnits, uint256 minted, uint256 stake, string memory status);
    function getBatchProductCount(uint256 batchId) external view returns (uint256);

    // Dispute functions
    function raiseDispute(uint256 productId, bytes32 reasonHash) external;
    function resolveDispute(uint256 productId, address winner) external;
    function claimRefund(uint256 productId) external;
    function isDisputeActive(uint256 productId) external view returns (bool);

    // Relayer functions
    function approveRelayer(address relayer) external;
    function executeMetaTx(address user, uint256 productId, address to, bytes32 locationHash, uint256 nonce, uint256 deadline, bytes calldata signature) external;
}

