// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Ownable
/// @notice Lightweight Ownable implementation guarding sensitive operations.
abstract contract Ownable {
    error OwnerZeroAddress();
    error CallerNotOwner();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address private _owner;

    constructor() {
        _transferOwnership(msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != _owner) {
            revert CallerNotOwner();
        }
        _;
    }

    function owner() public view returns (address) {
        return _owner;
    }

    function renounceOwnership() public onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public onlyOwner {
        if (newOwner == address(0)) {
            revert OwnerZeroAddress();
        }
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal {
        address previousOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
