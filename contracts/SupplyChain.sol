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
    InvalidSignature
} from "./errors/SupplyChainErrors.sol";

contract SupplyChain is ISupplyChain, SupplyChainRoles, EIP712 {
    using ECDSA for bytes32;

    struct Product {
        uint256 batchId;
        address owner;
        bytes32 metadataHash;
        bool exists;
    }

    struct PendingTransfer {
        address to;
        bytes32 locationHash;
        bool exists;
    }

    mapping(uint256 => Batch) public batches;
    mapping(uint256 => Product) private products;
    mapping(uint256 => PendingTransfer) private pendingTransfers;

    mapping(address => uint256) public override nonces;

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

        emit BatchRegistered(batchId, msg.sender, maxUnits, msg.value);
    }

    function mintProduct(uint256 productId, uint256 batchId, bytes32 metadataHash) external onlyRole(MANUFACTURER) {
        if (products[productId].exists) revert ProductAlreadyExists();

        Batch storage b = batches[batchId];
        if (!b.active) revert BatchNotActive();
        if (b.manufacturer != msg.sender) revert NotAuthorized();
        if (b.minted >= b.maxUnits) revert BatchLimitReached();

        b.minted += 1;

        products[productId] = Product({
            batchId: batchId,
            owner: msg.sender,
            metadataHash: metadataHash,
            exists: true
        });

        emit ProductMinted(productId, batchId, msg.sender, metadataHash);
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
        nonces[signer] = nonce + 1;

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
        nonces[signer] = nonce + 1;

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

    function _initiateTransfer(address from, uint256 productId, address to, bytes32 locationHash) internal {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();
        if (p.owner != from) revert NotAuthorized();
        if (pendingTransfers[productId].exists) revert TransferAlreadyPending();
        if (to == address(0) || to == from) revert InvalidReceiver();

        pendingTransfers[productId] = PendingTransfer({to: to, locationHash: locationHash, exists: true});
        emit TransferInitiated(productId, from, to, locationHash);
    }

    function _acceptTransfer(address receiver, uint256 productId) internal {
        Product storage p = products[productId];
        if (!p.exists) revert ProductNotFound();

        PendingTransfer storage t = pendingTransfers[productId];
        if (!t.exists) revert NoPendingTransfer();
        if (t.to != receiver) revert NotAuthorized();

        address from = p.owner;
        p.owner = receiver;
        delete pendingTransfers[productId];

        emit TransferAccepted(productId, from, receiver);
    }
}
