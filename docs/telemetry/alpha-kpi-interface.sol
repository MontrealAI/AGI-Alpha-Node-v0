// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Alpha Work Unit KPI Events
/// @notice Canonical event surface for deriving α-WU acceptance, quality, latency, and yield KPIs.
interface IAlphaWorkUnitKpiEvents {
    /// @notice Emitted when a new alpha work unit is minted by an agent for a node.
    /// @param id keccak256 identifier for the α-WU.
    /// @param agent Address of the submitting agent.
    /// @param node Registered node that orchestrated the α-WU.
    /// @param mintedAt Unix timestamp when the unit became actionable.
    event AlphaWUMinted(bytes32 indexed id, address indexed agent, address indexed node, uint256 mintedAt);

    /// @notice Emitted when a validator submits a scored attestation for an α-WU.
    /// @param id keccak256 identifier for the α-WU.
    /// @param validator Address of the validator submitting the attestation.
    /// @param stake Validator stake weight applied to the score.
    /// @param score Validator-assigned quality score (scaled to 1e18 basis).
    /// @param validatedAt Unix timestamp when the attestation was recorded.
    event AlphaWUValidated(
        bytes32 indexed id,
        address indexed validator,
        uint256 stake,
        uint256 score,
        uint256 validatedAt
    );

    /// @notice Emitted when an α-WU is accepted by governance after quorum validation.
    /// @param id keccak256 identifier for the α-WU.
    /// @param acceptedAt Unix timestamp when the α-WU was accepted.
    event AlphaWUAccepted(bytes32 indexed id, uint256 acceptedAt);

    /// @notice Emitted when slashing is applied to a validator for the referenced α-WU.
    /// @param id keccak256 identifier for the α-WU.
    /// @param validator Address of the validator being slashed.
    /// @param amount Amount of stake slashed (denominated in the validator stake token units).
    /// @param slashedAt Unix timestamp when the slash occurred.
    event SlashApplied(bytes32 indexed id, address indexed validator, uint256 amount, uint256 slashedAt);
}
