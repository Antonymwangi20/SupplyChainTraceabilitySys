// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {Batch} from "./SupplyChainBatch.sol";
import {SupplyChainRoles} from "./SupplyChainRoles.sol";
import {ISupplyChain} from "./interfaces/ISupplyChain.sol";

import {
    NotAuthorized,
    StakeRequired,
    BatchAlreadyRegistered,
    BatchNotActive,
    BatchLimitReached,
    InvalidBatch,
    ProductAlreadyExists,
    ProductNotFound,
    TransferAlreadyPending,
    NoPendingTransfer,
    InvalidReceiver,
    DeadlineExpired,
    InvalidSignature,
    DisputeNotActive,
    DisputeAlreadyResolved,
    InsufficientStake,
    NoRelayerApproval
} from "./errors/SupplyChainErrors.sol";

contract SupplyChain is ISupplyChain, SupplyChainRoles, EIP712 {
    using ECDSA for bytes32;

    enum BatchStatus { CREATED, FULLY_MINTED }

    struct Product {
        uint256 batchId;
        address owner;
        bytes32 metadataHash;
        bool exists;
    }

    struct PendingTransfer {
        address to;
        bytes32 locationHash;
        uint256 initiatedAt;
        bool exists;
    }

    struct Dispute {
        address disputer;
        bytes32 reasonHash;
        bool active;
        uint256 raisedAt;
    }

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => Product) private products;
    mapping(uint256 => PendingTransfer) private pendingTransfers;
    mapping(uint256 => Dispute) private disputes;
    mapping(uint256 => BatchStatus) private batchStatus;
    mapping(uint256 => uint256) private batchProductCount;
    mapping(uint256 => uint256) private productStake;
    
    // Relayer whitelist
    mapping(address => bool) public approvedRelayers;

    mapping(address => uint256) public override nonces;

    uint256 public constant TRANSFER_TIMEOUT = 3 days;

    bytes32 private constant INITIATE_TRANSFER_TYPEHASH =
        keccak256(
            "InitiateTransfer(uint256 productId,address to,bytes32 locationHash,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant ACCEPT_TRANSFER_TYPEHASH =
        keccak256("AcceptTransfer(uint256 productId,uint256 nonce,uint256 deadline)");

    constructor(address admin) EIP712("SupplyChain", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function registerBatch(uint256 batchId, uint256 maxUnits) external payable onlyRole(MANUFACTURER) {
        if (msg.value == 0) revert StakeRequired();
        if (maxUnits == 0) revert InvalidBatch();

        Batch storage b = batches[batchId];
        if (b.active) revert BatchAlreadyRegistered();

        b.manufacturer = msg.sender;
        b.maxUnits = maxUnits;
        b.minted = 0;
        b.stake = msg.value;
        b.active = true;

        batchStatus[batchId] = BatchStatus.CREATED;
        batchProductCount[batchId] = 0;

        emit BatchRegistered(batchId, msg.sender, maxUnits, msg.value);
        emit BatchStatusChanged(batchId, "CREATED", block.timestamp);
    }

    function mintProduct(uint256 productId, uint256 batchId, bytes32 metadataHash) external onlyRole(MANUFACTURER) {
        if (products[productId].exists) revert ProductAlreadyExists();

        Batch storage b = batches[batchId];
        if (!b.active) revert BatchNotActive();
        if (b.manufacturer != msg.sender) revert NotAuthorized();
        if (b.minted >= b.maxUnits) revert BatchLimitReached();

        b.minted += 1;
        batchProductCount[batchId] += 1;

        products[productId] = Product({
            batchId: batchId,
            owner: msg.sender,
            metadataHash: metadataHash,
            exists: true
        });

        // Allocate proportional stake per product
        productStake[productId] = b.stake / b.maxUnits;

        // Update batch status if all units minted
        if (b.minted == b.maxUnits) {
            batchStatus[batchId] = BatchStatus.FULLY_MINTED;
            emit BatchStatusChanged(batchId, "FULLY_MINTED", block.timestamp);
        }

        emit ProductMinted(productId, batchId, msg.sender, metadataHash);
        emit ProvenanceRecorded(productId, msg.sender, bytes32(0), "MINTED", block.timestamp);
    }

    function initiateTransfer(uint256 productId, address to, bytes32 locationHash) external {
        _initiateTransfer(msg.sender, productId, to, locationHash);
    }

    function acceptTransfer(uint256 productId) external {
        _acceptTransfer(msg.sender, productId);
    }

    function initiateTransferWithSig(
        uint256 productId,
        address to,
        bytes32 locationHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (deadline < block.timestamp) revert DeadlineExpired();

        bytes32 structHash = keccak256(
            abi.encode(INITIATE_TRANSFER_TYPEHASH, productId, to, locationHash, nonce, deadline)
        );
        address signer = _hashTypedDataV4(structHash).recover(signature);

        if (nonce != nonces[signer]) revert InvalidSignature();
        unchecked { nonces[signer] += 1; }

        _initiateTransfer(signer, productId, to, locationHash);
    }

    function acceptTransferWithSig(
        uint256 productId,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (deadline < block.timestamp) revert DeadlineExpired();

        bytes32 structHash = keccak256(abi.encode(ACCEPT_TRANSFER_TYPEHASH, productId, nonce, deadline));
        address signer = _hashTypedDataV4(structHash).recover(signature);

        if (nonce != nonces[signer]) revert InvalidSignature();
        unchecked { nonces[signer] += 1; }

        _acceptTransfer(signer, productId);
    }

    function ownerOf(uint256 productId) external view returns (address) {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();
        return p.owner;
    }

    function productBatch(uint256 productId) external view returns (uint256) {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();
        return p.batchId;
    }

    // Batch tracking queries
    function getBatchStatus(uint256 batchId) external view returns (string memory) {
        Batch storage b = batches[batchId];
        if (!b.active) revert BatchNotActive();
        BatchStatus status = batchStatus[batchId];
        return status == BatchStatus.CREATED ? "CREATED" : "FULLY_MINTED";
    }

    function getBatchMetadata(uint256 batchId) external view returns (address manufacturer, uint256 maxUnits, uint256 minted, uint256 stake, string memory status) {
        Batch storage b = batches[batchId];
        if (!b.active) revert BatchNotActive();
        BatchStatus bStatus = batchStatus[batchId];
        string memory statusStr = bStatus == BatchStatus.CREATED ? "CREATED" : "FULLY_MINTED";
        return (b.manufacturer, b.maxUnits, b.minted, b.stake, statusStr);
    }

    function getBatchProductCount(uint256 batchId) external view returns (uint256) {
        Batch storage b = batches[batchId];
        if (!b.active) revert BatchNotActive();
        return batchProductCount[batchId];
    }

    // Dispute functions
    function raiseDispute(uint256 productId, bytes32 reasonHash) external {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();
        
        Dispute storage d = disputes[productId];
        if (d.active) revert DisputeAlreadyResolved();
        
        d.disputer = msg.sender;
        d.reasonHash = reasonHash;
        d.active = true;
        d.raisedAt = block.timestamp;

        emit DisputeRaised(productId, msg.sender, "Dispute raised", block.timestamp);
        emit ProvenanceRecorded(productId, msg.sender, bytes32(0), "DISPUTE_RAISED", block.timestamp);
    }

    function resolveDispute(uint256 productId, address winner) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Dispute storage d = disputes[productId];
        if (!d.active) revert DisputeNotActive();

        PendingTransfer storage t = pendingTransfers[productId];
        
        uint256 slashedAmount = 0;
        
        // Slash per-product stake if transfer was initiated
        if (t.exists) {
            uint256 pStake = productStake[productId];
            if (pStake > 0) {
                slashedAmount = pStake / 2;
                productStake[productId] -= slashedAmount;
                (bool success, ) = payable(winner).call{value: slashedAmount}("");
                require(success, "Transfer failed");
            }
            delete pendingTransfers[productId];
        }

        d.active = false;
        emit DisputeResolved(productId, winner, slashedAmount, block.timestamp);
        emit ProvenanceRecorded(productId, winner, bytes32(0), "DISPUTE_RESOLVED", block.timestamp);
    }

    function isDisputeActive(uint256 productId) external view returns (bool) {
        return disputes[productId].active;
    }

    // Relayer functions
    function approveRelayer(address relayer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        approvedRelayers[relayer] = true;
        emit RelayerApproved(relayer, true);
    }

    function executeMetaTx(
        address user,
        uint256 productId,
        address to,
        bytes32 locationHash,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (!approvedRelayers[msg.sender]) revert NoRelayerApproval();
        if (deadline < block.timestamp) revert DeadlineExpired();

        bytes32 structHash = keccak256(
            abi.encode(INITIATE_TRANSFER_TYPEHASH, productId, to, locationHash, nonce, deadline)
        );
        address signer = _hashTypedDataV4(structHash).recover(signature);

        if (signer != user) revert InvalidSignature();
        if (nonce != nonces[user]) revert InvalidSignature();
        unchecked { nonces[user] += 1; }

        _initiateTransfer(user, productId, to, locationHash);
        emit MetaTxExecuted(msg.sender, user, nonce);
    }

    function _initiateTransfer(address from, uint256 productId, address to, bytes32 locationHash) internal {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();
        if (p.owner != from) revert NotAuthorized();
        
        PendingTransfer storage t = pendingTransfers[productId];
        // Check if transfer expired
        if (t.exists && block.timestamp > t.initiatedAt + TRANSFER_TIMEOUT) {
            delete pendingTransfers[productId];
        }
        
        if (pendingTransfers[productId].exists) revert TransferAlreadyPending();
        if (to == address(0) || to == from) revert InvalidReceiver();
        if (disputes[productId].active) revert DisputeNotActive();

        pendingTransfers[productId] = PendingTransfer({
            to: to,
            locationHash: locationHash,
            initiatedAt: block.timestamp,
            exists: true
        });

        emit TransferInitiated(productId, from, to, locationHash);
        emit ProvenanceRecorded(productId, from, locationHash, "TRANSFER_INITIATED", block.timestamp);
    }

    function _acceptTransfer(address receiver, uint256 productId) internal {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();

        PendingTransfer storage t = pendingTransfers[productId];
        if (!t.exists) revert NoPendingTransfer();
        if (block.timestamp > t.initiatedAt + TRANSFER_TIMEOUT) revert DeadlineExpired();
        if (t.to != receiver) revert NotAuthorized();
        if (disputes[productId].active) revert DisputeNotActive();

        address from = p.owner;
        p.owner = receiver;
        delete pendingTransfers[productId];

        emit TransferAccepted(productId, from, receiver);
        emit ProvenanceRecorded(productId, receiver, t.locationHash, "TRANSFER_ACCEPTED", block.timestamp);
    }
}
