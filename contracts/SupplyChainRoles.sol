// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

abstract contract SupplyChainRoles is AccessControl {
    bytes32 public constant MANUFACTURER = keccak256("MANUFACTURER");
    bytes32 public constant DISTRIBUTOR = keccak256("DISTRIBUTOR");
    bytes32 public constant INSPECTOR = keccak256("INSPECTOR");

    function grantRoleSafe(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(role, account);
    }
}
