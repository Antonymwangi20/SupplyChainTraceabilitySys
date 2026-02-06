
pragma solidity ^0.8.24;

interface ISupplyChain {
    event BatchRegistered(uint256 indexed batchId, address indexed manufacturer, uint256 maxUnits, uint256 stake);
    event ProductMinted(uint256 indexed productId, uint256 indexed batchId, address indexed owner, bytes32 metadataHash);
    event TransferInitiated(uint256 indexed productId, address indexed from, address indexed to, bytes32 locationHash);
    event TransferAccepted(uint256 indexed productId, address indexed from, address indexed to);

    function registerBatch(uint256 batchId, uint256 maxUnits) external payable;

    function mintProduct(uint256 productId, uint256 batchId, bytes32 metadataHash) external;

    function initiateTransfer(uint256 productId, address to, bytes32 locationHash) external;

    function acceptTransfer(uint256 productId) external;

    function nonces(address account) external view returns (uint256);
}

