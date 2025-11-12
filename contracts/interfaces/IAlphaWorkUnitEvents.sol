// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Alpha Work Unit Event Interface
/// @notice Canonical event surface emitted by AGI Alpha Node compatible registries.
interface IAlphaWorkUnitEvents {
    /// @notice Emitted whenever a new alpha work unit is minted for an agent.
    /// @param id Canonical identifier for the alpha work unit (bytes32).
    /// @param agent ENS-resolved agent or operator address responsible for execution.
    /// @param node The node that produced the unit.
    /// @param timestamp UNIX timestamp for the mint event.
    event AlphaWUMinted(bytes32 indexed id, address indexed agent, address indexed node, uint256 timestamp);

    /// @notice Emitted when a validator scores an alpha work unit submission.
    /// @param id Work unit identifier.
    /// @param validator Address of the validator emitting the score.
    /// @param stake Validator stake used for weighting downstream KPIs.
    /// @param score Validator supplied score (0-10000 == 0-100.00%).
    /// @param timestamp UNIX timestamp of the validation event.
    event AlphaWUValidated(
        bytes32 indexed id,
        address indexed validator,
        uint256 stake,
        uint256 score,
        uint256 timestamp
    );

    /// @notice Emitted when an alpha work unit is accepted by the protocol.
    /// @param id Work unit identifier.
    /// @param timestamp UNIX timestamp for acceptance.
    event AlphaWUAccepted(bytes32 indexed id, uint256 timestamp);

    /// @notice Emitted whenever a slashing event is applied to a validator for a work unit.
    /// @param id Work unit identifier.
    /// @param validator Address of the slashed validator.
    /// @param amount Amount of stake slashed in protocol native units.
    /// @param timestamp UNIX timestamp for the slash event.
    event SlashApplied(bytes32 indexed id, address indexed validator, uint256 amount, uint256 timestamp);
}
