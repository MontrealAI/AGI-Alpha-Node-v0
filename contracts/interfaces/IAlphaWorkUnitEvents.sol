// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Alpha Work Unit Event Interface
/// @notice Canonical event surface emitted by AGI Alpha Node compatible registries.
/// @dev Events intentionally expose just enough data for the telemetry mesh to derive the
///      four α-WU KPIs (acceptance rate, validator-weighted quality, on-time completion,
///      and slashing-adjusted yield) without auxiliary oracles. Implementations should only
///      emit production telemetry when the deployment is healthy (`isHealthy == true`) so
///      downstream dashboards stay aligned with the CI-controlled safety rails.
/// @custom:ens Runtime implementations must enforce ENS name-gating via an
///             IdentityRegistry so only authorised agents, validators, and nodes emit
///             these logs. Recommended allow-list: `*.agent.agi.eth`,
///             `*.alpha.agent.agi.eth`, `*.node.agi.eth`, `*.alpha.node.agi.eth`,
///             `*.club.agi.eth`, and `*.alpha.club.agi.eth`.
/// @custom:section alpha-wu-telemetry
interface IAlphaWorkUnitEvents {
    /// @notice Emitted whenever a new alpha work unit is minted for an agent.
    /// @param id Canonical identifier for the alpha work unit (bytes32).
    /// @param agent ENS-resolved agent or operator address responsible for execution.
    /// @param node The node that produced the unit.
    /// @param mintedAt UNIX timestamp for the mint event.
    /// @custom:kpi acceptance-rate
    /// @custom:kpi on-time-completion
    event AlphaWUMinted(bytes32 indexed id, address indexed agent, address indexed node, uint256 mintedAt);

    /// @notice Emitted when a validator scores an alpha work unit submission.
    /// @param id Work unit identifier.
    /// @param validator Address of the validator emitting the score.
    /// @param stake Validator stake used for weighting downstream KPIs.
    /// @param score Validator supplied score (0-10000 == 0-100.00%).
    /// @param validatedAt UNIX timestamp of the validation event.
    /// @custom:kpi validator-weighted-quality
    event AlphaWUValidated(
        bytes32 indexed id,
        address indexed validator,
        uint256 stake,
        uint256 score,
        uint256 validatedAt
    );

    /// @notice Emitted when an alpha work unit is accepted by the protocol.
    /// @param id Work unit identifier.
    /// @param acceptedAt UNIX timestamp for acceptance.
    /// @custom:kpi acceptance-rate
    /// @custom:kpi on-time-completion
    /// @custom:kpi slashing-adjusted-yield
    event AlphaWUAccepted(bytes32 indexed id, uint256 acceptedAt);

    /// @notice Emitted whenever a slashing event is applied to a validator for a work unit.
    /// @param id Work unit identifier.
    /// @param validator Address of the slashed validator.
    /// @param amount Amount of stake slashed in protocol native units.
    /// @param slashedAt UNIX timestamp for the slash event.
    /// @custom:kpi slashing-adjusted-yield
    event SlashApplied(bytes32 indexed id, address indexed validator, uint256 amount, uint256 slashedAt);
}
