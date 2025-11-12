// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAlphaWorkUnitEvents} from "./interfaces/IAlphaWorkUnitEvents.sol";

/// @notice Minimal ERC20 interface required for staking interactions.
interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);

    function transferFrom(address from, address to, uint256 value) external returns (bool);

    function balanceOf(address owner) external view returns (uint256);

    function allowance(address owner, address spender) external view returns (uint256);
}

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

/// @title Alpha Node Manager
/// @notice Coordinates validator activity, staking, and identity gating for Alpha Work Units.
contract AlphaNodeManager is Ownable, IAlphaWorkUnitEvents {
    error AlreadyPaused();
    error NotPaused();
    error InvalidAddress();
    error InvalidEnsNode();
    error IdentityMissing();
    error IdentityInactive();
    error UnauthorizedMintCaller();
    error UnauthorizedAcceptance();
    error NotValidator();
    error InvalidAmount();
    error ValidatorUnknown();
    error InsufficientStake();

    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event ValidatorUpdated(address indexed validator, bool active);
    event IdentityRegistered(bytes32 indexed ensNode, address indexed controller);
    event IdentityStatusChanged(bytes32 indexed ensNode, address indexed controller, bool active);
    event IdentityRevoked(bytes32 indexed ensNode, address indexed controller);
    event IdentityControllerUpdated(bytes32 indexed ensNode, address indexed previousController, address indexed newController);
    event StakeDeposited(address indexed account, uint256 amount);
    event StakeWithdrawn(address indexed recipient, uint256 amount);

    address public constant CANONICAL_AGIALPHA = 0xa61A3B3A130A9C20768eEBf97E21515A6046a1FA;

    IERC20 public immutable stakingToken;
    bool public paused;

    struct IdentityRecord {
        bytes32 ensNode;
        bool active;
    }

    mapping(address => IdentityRecord) private identities;
    mapping(bytes32 => address) private controllers;
    mapping(address => bool) public validators;
    mapping(address => uint256) public stakedBalance;

    constructor(address tokenAddress) {
        if (tokenAddress == address(0)) {
            stakingToken = IERC20(CANONICAL_AGIALPHA);
        } else {
            if (tokenAddress != CANONICAL_AGIALPHA) {
                revert InvalidAddress();
            }
            stakingToken = IERC20(tokenAddress);
        }
    }

    modifier whenNotPaused() {
        if (paused) {
            revert AlreadyPaused();
        }
        _;
    }

    function pause() external onlyOwner {
        if (paused) {
            revert AlreadyPaused();
        }
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) {
            revert NotPaused();
        }
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setValidator(address validator, bool active) external onlyOwner {
        if (validator == address(0)) {
            revert InvalidAddress();
        }
        validators[validator] = active;
        emit ValidatorUpdated(validator, active);
    }

    function registerIdentity(bytes32 ensNode, address controller) external onlyOwner {
        if (ensNode == bytes32(0)) {
            revert InvalidEnsNode();
        }
        if (controller == address(0)) {
            revert InvalidAddress();
        }

        address existingController = controllers[ensNode];
        if (existingController != address(0) && existingController != controller) {
            identities[existingController].active = false;
            emit IdentityStatusChanged(ensNode, existingController, false);
        }

        controllers[ensNode] = controller;
        identities[controller] = IdentityRecord({ensNode: ensNode, active: true});
        emit IdentityRegistered(ensNode, controller);
    }

    function updateIdentityController(bytes32 ensNode, address newController) external onlyOwner {
        if (ensNode == bytes32(0)) {
            revert InvalidEnsNode();
        }
        if (newController == address(0)) {
            revert InvalidAddress();
        }
        address previousController = controllers[ensNode];
        if (previousController == address(0)) {
            revert IdentityMissing();
        }

        identities[previousController] = IdentityRecord({ensNode: bytes32(0), active: false});
        controllers[ensNode] = newController;
        identities[newController] = IdentityRecord({ensNode: ensNode, active: true});
        emit IdentityControllerUpdated(ensNode, previousController, newController);
    }

    function setIdentityStatus(bytes32 ensNode, bool active) external onlyOwner {
        address controller = controllers[ensNode];
        if (controller == address(0)) {
            revert IdentityMissing();
        }
        identities[controller].active = active;
        emit IdentityStatusChanged(ensNode, controller, active);
    }

    function revokeIdentity(bytes32 ensNode) external onlyOwner {
        address controller = controllers[ensNode];
        if (controller == address(0)) {
            revert IdentityMissing();
        }
        delete controllers[ensNode];
        delete identities[controller];
        emit IdentityRevoked(ensNode, controller);
    }

    function getIdentity(address controller)
        external
        view
        returns (bytes32 ensNode, bool active)
    {
        IdentityRecord memory record = identities[controller];
        ensNode = record.ensNode;
        active = record.active;
    }

    function ensNodeController(bytes32 ensNode) external view returns (address) {
        return controllers[ensNode];
    }

    function isIdentityActive(address controller) public view returns (bool) {
        IdentityRecord memory record = identities[controller];
        return record.active && record.ensNode != bytes32(0);
    }

    function stake(uint256 amount) external whenNotPaused {
        if (amount == 0) {
            revert InvalidAmount();
        }
        _requireActiveIdentity(msg.sender);
        if (!stakingToken.transferFrom(msg.sender, address(this), amount)) {
            revert InvalidAmount();
        }
        stakedBalance[msg.sender] += amount;
        emit StakeDeposited(msg.sender, amount);
    }

    function withdrawStake(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        if (!stakingToken.transfer(recipient, amount)) {
            revert InvalidAmount();
        }
        emit StakeWithdrawn(recipient, amount);
    }

    function recordAlphaWUMint(bytes32 id, address agent, address node) external whenNotPaused {
        if (id == bytes32(0)) {
            revert InvalidEnsNode();
        }
        if (agent == address(0) || node == address(0)) {
            revert InvalidAddress();
        }
        _requireActiveIdentity(agent);
        if (msg.sender != agent && msg.sender != owner()) {
            revert UnauthorizedMintCaller();
        }
        emit AlphaWUMinted(id, agent, node, block.timestamp);
    }

    function recordAlphaWUValidation(bytes32 id, uint256 stakeAmount, uint256 score) external whenNotPaused {
        if (!validators[msg.sender]) {
            revert NotValidator();
        }
        if (id == bytes32(0)) {
            revert InvalidEnsNode();
        }
        if (stakeAmount == 0) {
            revert InvalidAmount();
        }
        uint256 recordedStake = stakedBalance[msg.sender];
        if (stakeAmount > recordedStake) {
            revert InsufficientStake();
        }
        emit AlphaWUValidated(id, msg.sender, stakeAmount, score, block.timestamp);
    }

    function recordAlphaWUAcceptance(bytes32 id) external whenNotPaused {
        if (id == bytes32(0)) {
            revert InvalidEnsNode();
        }
        if (msg.sender != owner() && !validators[msg.sender]) {
            revert UnauthorizedAcceptance();
        }
        emit AlphaWUAccepted(id, block.timestamp);
    }

    function applySlash(bytes32 id, address validator, uint256 amount) external onlyOwner {
        if (id == bytes32(0)) {
            revert InvalidEnsNode();
        }
        if (validator == address(0)) {
            revert InvalidAddress();
        }
        if (!validators[validator]) {
            revert ValidatorUnknown();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        emit SlashApplied(id, validator, amount, block.timestamp);
    }

    function _requireActiveIdentity(address controller) internal view {
        IdentityRecord memory record = identities[controller];
        if (!record.active || record.ensNode == bytes32(0)) {
            revert IdentityInactive();
        }
    }
}
