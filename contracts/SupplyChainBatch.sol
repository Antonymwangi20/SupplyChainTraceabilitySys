pragma solidity ^0.8.24;

struct Batch {
    address manufacturer;
    uint256 maxUnits;
    uint256 minted;
    uint256 stake;
    bool active;
}
