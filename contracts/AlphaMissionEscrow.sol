// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "./access/Ownable.sol";

interface IAlphaToken {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Funded $AGIALPHA missions. No minting, automatic yield or AGI Jobs dependency.
/// @dev Review is an explicit judgment by the funding owner's designated reviewer.
contract AlphaMissionEscrow is Ownable {
    error InvalidMission();
    error Unauthorized();
    error WrongState();
    error TransferFailed();
    error Paused();
    error Reentrant();

    address public constant TOKEN = 0xA61a3B3a130a9c20768EEBF97E21515A6046a1fA;
    enum Status { None, Funded, Submitted, Accepted, Rejected, Paid, Refunded }
    struct Mission {
        address node;
        address reviewer;
        address funder;
        uint256 reward;
        uint256 deadline;
        bytes32 evidenceHash;
        Status status;
    }
    mapping(bytes32 => Mission) public missions;
    uint256 public reserved;
    bool public paused;
    bool private entered;
    event MissionFunded(bytes32 indexed workId, address indexed node, address indexed reviewer, uint256 reward, uint256 deadline);
    event EvidenceSubmitted(bytes32 indexed workId, bytes32 evidenceHash);
    event MissionReviewed(bytes32 indexed workId, bytes32 evidenceHash, bool accepted);
    event MissionPaid(bytes32 indexed workId, address indexed node, uint256 amount);
    event MissionRefunded(bytes32 indexed workId, address indexed funder, uint256 amount);
    event PauseChanged(bool paused);

    modifier nonReentrant() {
        if (entered) revert Reentrant();
        entered = true;
        _;
        entered = false;
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PauseChanged(value);
    }

    function fund(bytes32 workId, address node, address reviewer, uint256 reward, uint256 deadline) external onlyOwner nonReentrant {
        if (paused) revert Paused();
        if (workId == bytes32(0) || node == address(0) || reviewer == address(0) || node == reviewer || reward == 0 || deadline <= block.timestamp) revert InvalidMission();
        if (missions[workId].status != Status.None) revert WrongState();
        uint256 beforeBalance = IAlphaToken(TOKEN).balanceOf(address(this));
        if (!IAlphaToken(TOKEN).transferFrom(msg.sender, address(this), reward)) revert TransferFailed();
        if (IAlphaToken(TOKEN).balanceOf(address(this)) != beforeBalance + reward) revert TransferFailed();
        missions[workId] = Mission(node, reviewer, msg.sender, reward, deadline, bytes32(0), Status.Funded);
        reserved += reward;
        emit MissionFunded(workId, node, reviewer, reward, deadline);
    }

    function submit(bytes32 workId, bytes32 evidenceHash) external {
        if (paused) revert Paused();
        Mission storage mission = missions[workId];
        if (msg.sender != mission.node) revert Unauthorized();
        if (mission.status != Status.Funded || block.timestamp > mission.deadline || evidenceHash == bytes32(0)) revert WrongState();
        mission.evidenceHash = evidenceHash;
        mission.status = Status.Submitted;
        emit EvidenceSubmitted(workId, evidenceHash);
    }

    function review(bytes32 workId, bytes32 evidenceHash, bool accepted) external {
        if (paused) revert Paused();
        Mission storage mission = missions[workId];
        if (msg.sender != mission.reviewer) revert Unauthorized();
        if (mission.status != Status.Submitted || block.timestamp > mission.deadline || evidenceHash != mission.evidenceHash) revert WrongState();
        mission.status = accepted ? Status.Accepted : Status.Rejected;
        emit MissionReviewed(workId, evidenceHash, accepted);
    }

    /// @notice Anyone can trigger payment; the recipient is always the funded node.
    /// @dev Claims remain available while paused and after the deadline once accepted.
    function claim(bytes32 workId) external nonReentrant {
        Mission storage mission = missions[workId];
        if (mission.status != Status.Accepted) revert WrongState();
        mission.status = Status.Paid;
        reserved -= mission.reward;
        if (!IAlphaToken(TOKEN).transfer(mission.node, mission.reward)) revert TransferFailed();
        emit MissionPaid(workId, mission.node, mission.reward);
    }

    /// @notice Return rejected or expired unaccepted work to its original funder.
    function refund(bytes32 workId) external nonReentrant {
        Mission storage mission = missions[workId];
        if (mission.status != Status.Rejected && !((mission.status == Status.Funded || mission.status == Status.Submitted) && block.timestamp > mission.deadline)) revert WrongState();
        mission.status = Status.Refunded;
        reserved -= mission.reward;
        if (!IAlphaToken(TOKEN).transfer(mission.funder, mission.reward)) revert TransferFailed();
        emit MissionRefunded(workId, mission.funder, mission.reward);
    }

    function sweepSurplus(address recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || amount > IAlphaToken(TOKEN).balanceOf(address(this)) - reserved) revert InvalidMission();
        if (!IAlphaToken(TOKEN).transfer(recipient, amount)) revert TransferFailed();
    }
}
