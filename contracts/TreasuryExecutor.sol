// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "./access/Ownable.sol";

/// @title TreasuryExecutor
/// @notice Owner-controlled treasury router used by the Mode A PQ orchestrator.
contract TreasuryExecutor is Ownable {
    error ZeroAddress();
    error NotOrchestrator();
    error TreasuryPaused();
    error TreasuryNotPaused();
    error IntentAlreadyExecuted(bytes32 intentHash);
    error CallFailed();

    event OrchestratorUpdated(address indexed previousOrchestrator, address indexed newOrchestrator);
    event TreasuryPauseChanged(bool paused, address indexed caller);
    event IntentStatusUpdated(bytes32 indexed intentHash, address indexed caller, bool executed);
    event IntentExecuted(bytes32 indexed intentHash, address indexed executor, address indexed to, uint256 value, bytes data);
    event FundsSwept(address indexed recipient, uint256 amount);

    address public orchestrator;
    bool public paused;
    mapping(bytes32 => bool) public executedIntents;

    constructor(address initialOrchestrator) {
        address resolved = initialOrchestrator == address(0) ? msg.sender : initialOrchestrator;
        orchestrator = resolved;
        emit OrchestratorUpdated(address(0), resolved);
    }

    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) {
            revert NotOrchestrator();
        }
        _;
    }

    modifier whenNotPaused() {
        if (paused) {
            revert TreasuryPaused();
        }
        _;
    }

    receive() external payable {}

    fallback() external payable {}

    function setOrchestrator(address newOrchestrator) external onlyOwner {
        if (newOrchestrator == address(0)) {
            revert ZeroAddress();
        }
        address previous = orchestrator;
        orchestrator = newOrchestrator;
        emit OrchestratorUpdated(previous, newOrchestrator);
    }

    function pause() external onlyOwner {
        if (paused) {
            revert TreasuryPaused();
        }
        paused = true;
        emit TreasuryPauseChanged(true, msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) {
            revert TreasuryNotPaused();
        }
        paused = false;
        emit TreasuryPauseChanged(false, msg.sender);
    }

    function computeIntentHash(address to, uint256 value, bytes calldata data) public pure returns (bytes32) {
        return keccak256(abi.encode(to, value, data));
    }

    function setIntentStatus(bytes32 intentHash, bool executed) external onlyOwner {
        executedIntents[intentHash] = executed;
        emit IntentStatusUpdated(intentHash, msg.sender, executed);
    }

    function executeTransaction(address to, uint256 value, bytes calldata data)
        external
        onlyOrchestrator
        whenNotPaused
        returns (bytes memory result)
    {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        bytes32 intentHash = computeIntentHash(to, value, data);
        if (executedIntents[intentHash]) {
            revert IntentAlreadyExecuted(intentHash);
        }

        executedIntents[intentHash] = true;

        (bool success, bytes memory returndata) = to.call{value: value}(data);
        if (!success) {
            executedIntents[intentHash] = false;
            _bubbleRevert(returndata);
        }

        emit IntentExecuted(intentHash, msg.sender, to, value, data);
        return returndata;
    }

    function sweep(address payable recipient) external onlyOwner {
        if (recipient == address(0)) {
            revert ZeroAddress();
        }
        uint256 balance = address(this).balance;
        (bool success, ) = recipient.call{value: balance}("");
        if (!success) {
            revert CallFailed();
        }
        emit FundsSwept(recipient, balance);
    }

    function _bubbleRevert(bytes memory returndata) private pure {
        if (returndata.length == 0) {
            revert CallFailed();
        }
        // solhint-disable-next-line no-inline-assembly
        assembly {
            revert(add(returndata, 0x20), mload(returndata))
        }
    }
}
