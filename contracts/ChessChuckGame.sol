// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../../solidity/ICasinoGameV2.sol";

/**
 * @title ChessChuckGame
 * @notice Casino game for the ChessChuck chess-oracle betting game.
 *         Players predict whether White wins, Draw, or Black wins in a
 *         live grandmaster game. VRF randomness selects the outcome,
 *         weighted to true grandmaster win-probability statistics.
 *
 *         Game pattern: INSTANT — no player actions after open.
 *         onSessionStart → WAITING_RANDOMNESS → onRandomness → SETTLED
 *
 * @dev Declared RTP: 95.0%
 *      White wins:  37.50% probability, 2.5333x payout → 95.0% RTP
 *      Draw:        34.90% probability, 2.7220x payout → 95.00% RTP
 *      Black wins:  27.60% probability, 3.4420x payout → 95.00% RTP
 */
contract ChessChuckGame is ICasinoGameV2 {

    // ──────────────────────────────────────────────────────────
    // PREDICTION CONSTANTS
    // ──────────────────────────────────────────────────────────

    uint8 public constant WHITE_WINS = 0;
    uint8 public constant DRAW       = 1;
    uint8 public constant BLACK_WINS = 2;

    // ──────────────────────────────────────────────────────────
    // PROBABILITY THRESHOLDS
    //
    // We sample a uint16 from the derived randomness (range 0–65535,
    // covering 65536 values). We partition this space using the true
    // grandmaster win probability statistics from our 10,000 game pool:
    //
    //   White wins: [0,     24575]  → 24576 values → 24576/65536 = 37.500%
    //   Draw:       [24576, 47447]  → 22872 values → 22872/65536 = 34.900%
    //   Black wins: [47448, 65535]  → 18088 values → 18088/65536 = 27.600%
    //   Total:                        65536 values → 100.000%
    //
    // No rejection sampling needed here because we partition the ENTIRE
    // uint16 range — every value maps to exactly one outcome, zero waste.
    // ──────────────────────────────────────────────────────────

    uint16 public constant WHITE_UPPER = 24575;  // [0 .. 24575]
    uint16 public constant DRAW_UPPER  = 47447;  // [24576 .. 47447]
    // BLACK_WINS:                                  [47448 .. 65535]

    // ──────────────────────────────────────────────────────────
    // PAYOUT MULTIPLIERS (in basis points; 10000 = 1.0x)
    //
    // Formula: multiplier = RTP / probability
    // RTP = 95% = 0.95
    //
    //   White: 0.95 / 0.37500  = 2.5333...  → floor(25333) bps
    //   Draw:  0.95 / 0.34900  = 2.7220...  → floor(27220) bps
    //   Black: 0.95 / 0.27600  = 3.4420...  → floor(34420) bps
    //
    // Flooring keeps all payouts fractionally below 95% RTP — the house
    // always retains a small edge from integer truncation.
    // ──────────────────────────────────────────────────────────

    uint256 public constant BASIS_POINTS       = 10_000;
    uint256 public constant WHITE_MULT_BPS     = 25_333;  // 2.5333x
    uint256 public constant DRAW_MULT_BPS      = 27_220;  // 2.7220x
    uint256 public constant BLACK_MULT_BPS     = 34_420;  // 3.4420x

    // ──────────────────────────────────────────────────────────
    // WIN PROBABILITIES IN WAD (1e18 = 100%)
    // Used by quoteRiskParams for the vault portfolio VaR model.
    // These must match the threshold constants exactly.
    // ──────────────────────────────────────────────────────────

    uint256 public constant WHITE_PROB_WAD =  375000000000000000; // 37.5000%
    uint256 public constant DRAW_PROB_WAD  =  348999023437500000; // 22872/65536
    uint256 public constant BLACK_PROB_WAD =  276000976562500000; // 18088/65536
    // Sum: exactly 1e18 ✓

    // ──────────────────────────────────────────────────────────
    // CUSTOM ERRORS
    // ──────────────────────────────────────────────────────────

    error ChessChuck__InvalidPrediction(uint8 prediction);
    error ChessChuck__NoPlayerAction();

    // ──────────────────────────────────────────────────────────
    // ICasinoGameV2 IMPLEMENTATION
    // ──────────────────────────────────────────────────────────

    /**
     * @notice Returns the max escrow stake and max reserved profit for this bet.
     * @dev The facet requires maxEscrowStake >= wager or openSession reverts.
     *      maxReservedProfit is what the vault pre-reserves to cover worst-case payout.
     *
     * gameData encoding: abi.encode(uint8 prediction, uint32 roundId)
     */
    function quoteCaps(
        uint256 wager,
        bytes calldata gameData
    ) external pure returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
        (uint8 prediction, ) = abi.decode(gameData, (uint8, uint32));
        if (prediction > 2) revert ChessChuck__InvalidPrediction(prediction);

        uint256 maxPayout = _computePayout(wager, prediction);
        maxEscrowStake   = wager;
        maxReservedProfit = maxPayout > wager ? maxPayout - wager : 0;
    }

    /**
     * @notice Returns risk parameters for the vault's portfolio VaR model.
     * @dev probabilityWad is the WIN probability for the player's specific prediction.
     *      The facet uses this to size the vault reserve for this session.
     */
    function quoteRiskParams(
        uint256 wager,
        bytes calldata gameData
    ) external pure returns (
        uint256 maxPayout,
        uint256 probabilityWad,
        uint256 expectedPayout,
        uint256 subJackpotVarianceScaled
    ) {
        (uint8 prediction, ) = abi.decode(gameData, (uint8, uint32));
        if (prediction > 2) revert ChessChuck__InvalidPrediction(prediction);

        maxPayout              = _computePayout(wager, prediction);
        probabilityWad         = _getProbabilityWad(prediction);
        expectedPayout         = (maxPayout * probabilityWad) / 1e18;  // exact: win payout × win probability
        subJackpotVarianceScaled = 0;  // Not a jackpot/heavy-tail game
    }

    /**
     * @notice Called when the player places a bet.
     * @dev Decodes gameData, validates prediction, commits reserved profit,
     *      and requests VRF randomness immediately (instant game pattern).
     *
     * gameData:  abi.encode(uint8 prediction, uint32 roundId)
     * gameState: abi.encode(uint8 prediction, uint32 roundId, uint8 outcome, bool settled)
     *            outcome = 255 while waiting for randomness (sentinel)
     */
    function onSessionStart(
        SessionContext calldata ctx
    ) external pure returns (StepResult memory result) {
        (uint8 prediction, uint32 roundId) = abi.decode(ctx.gameData, (uint8, uint32));
        if (prediction > 2) revert ChessChuck__InvalidPrediction(prediction);

        uint256 maxPayout      = _computePayout(ctx.wagerBase, prediction);
        uint256 reservedProfit = maxPayout > ctx.wagerBase ? maxPayout - ctx.wagerBase : 0;

        // Store prediction and roundId in state; outcome filled in by onRandomness
        result.newGameState          = abi.encode(prediction, roundId, uint8(255), false);
        result.escrowDelta           = 0;
        result.reservedProfitDelta   = int256(reservedProfit);  // commit vault reserve
        result.nextPhase             = SessionPhase.WAITING_RANDOMNESS;
        result.requestRandomnessNow  = true;
        result.payout                = 0;
    }

    /**
     * @notice ChessChuck is an instant game — no player actions after open.
     */
    function onPlayerAction(
        SessionContext calldata,
        bytes calldata
    ) external pure returns (StepResult memory) {
        revert ChessChuck__NoPlayerAction();
    }

    /**
     * @notice Called when VRF delivers randomness. Derives the outcome, compares
     *         to the player's prediction, and settles the session.
     *
     * @dev Outcome derivation:
     *      1. Combine VRF seed with roundId via keccak256 to produce a round-specific hash.
     *         This prevents any correlation between the VRF fulfillment and the round ID.
     *      2. Take the last 2 bytes as a uint16 (range 0–65535).
     *      3. Map to outcome by threshold comparison (no modulo bias — full range used).
     */
    function onRandomness(
        SessionContext calldata ctx,
        bytes32 randomness
    ) external pure returns (StepResult memory result) {
        // Decode stored state
        (uint8 prediction, uint32 roundId, , ) = abi.decode(
            ctx.gameState,
            (uint8, uint32, uint8, bool)
        );

        // ── Derive weighted outcome ──────────────────────────────
        // Mix VRF seed with the specific round ID to get a round-unique hash.
        // This means even if the same VRF seed somehow repeated, different
        // rounds would still map to different outcomes.
        bytes32 derived = keccak256(abi.encodePacked(randomness, roundId));

        // Extract a uint16 from the last 2 bytes (bits 0–15)
        uint16 rng = uint16(uint256(derived));

        uint8 outcome;
        if (rng <= WHITE_UPPER) {
            outcome = WHITE_WINS;   // [0, 24575]     → 37.500%
        } else if (rng <= DRAW_UPPER) {
            outcome = DRAW;         // [24576, 47447]  → 34.900%
        } else {
            outcome = BLACK_WINS;   // [47448, 65535]  → 27.600%
        }

        // ── Determine payout ─────────────────────────────────────
        bool won    = (outcome == prediction);
        uint256 payout = won ? _computePayout(ctx.wagerBase, prediction) : 0;

        // ── Settle ───────────────────────────────────────────────
        result.newGameState          = abi.encode(prediction, roundId, outcome, true);
        result.escrowDelta           = 0;
        result.reservedProfitDelta   = 0;  // facet releases the reserve itself on SETTLED
        result.nextPhase             = SessionPhase.SETTLED;
        result.requestRandomnessNow  = false;
        result.payout                = payout;
    }

    // ──────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ──────────────────────────────────────────────────────────

    /**
     * @dev Compute player payout for a winning bet.
     *      payout = wager * multiplierBps / BASIS_POINTS
     *      (Integer division floors the result — fractional house edge preserved)
     */
    function _computePayout(uint256 wager, uint8 prediction) internal pure returns (uint256) {
        if (prediction == WHITE_WINS) return (wager * WHITE_MULT_BPS) / BASIS_POINTS;
        if (prediction == DRAW)       return (wager * DRAW_MULT_BPS)  / BASIS_POINTS;
                                      return (wager * BLACK_MULT_BPS) / BASIS_POINTS;
    }

    /**
     * @dev Win probability in WAD (1e18 = 100%) for the given prediction.
     *      Must align exactly with the threshold constants used in onRandomness.
     */
    function _getProbabilityWad(uint8 prediction) internal pure returns (uint256) {
        if (prediction == WHITE_WINS) return WHITE_PROB_WAD;
        if (prediction == DRAW)       return DRAW_PROB_WAD;
                                      return BLACK_PROB_WAD;
    }
}