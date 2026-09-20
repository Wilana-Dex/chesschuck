# ChessChuck

**Bet on how a chess game ends.**

▶️ **Play it: [chesschuck.vercel.app](https://chesschuck.vercel.app)**

Built for **Chain Jam Vol. 1** on the Chain casino SDK.

---

## What it is

Every 90 seconds a real, high-level chess game plays out on a 3D board. While bets are open you pick **White wins**, **Draw** or **Black wins**.

Your result is drawn by **on-chain VRF randomness right after you bet**, weighted to real chess result frequencies. The board is the show. The contract decides the result and the payout.

## How a round works

| Time | What happens |
|------|--------------|
| T=0 | New round starts. The board begins playing a game. Betting opens. |
| T=0–45 | Place your bet. The contract draws your result and settles your session. |
| T=45 | Betting locks. The camera starts an orbital pan. |
| ~T=75 | The board pauses on "analyzing positions" while the result is prepared. |
| T=80 | Your on-chain result is revealed and winners are paid. |
| T=80–90 | Payout display, then the next round loads. |

## Odds and RTP

| Pick | Probability | Multiplier | RTP |
|------|-------------|------------|-----|
| White wins | 37.50% (24576/65536) | 2.5333× | 95.00% |
| Draw | 34.90% (22872/65536) | 2.7220× | 95.00% |
| Black wins | 27.60% (18088/65536) | 3.4420× | 95.00% |

Theoretical RTP is 95% on every pick (94.998–95.000%, floored so the house edge is never below 5%).

## Fairness

- The outcome comes only from the VRF random word the platform delivers. `onRandomness` mixes it with the round id using `keccak256` and takes a 16-bit value.
- The 65,536 possible values are split into three exact ranges that match the odds above. Nothing is left over, so no rejection sampling is needed and there is no modulo bias.
- The payout is computed from that same draw. No off-chain input can change it.
- The chess game on the board is a real game from a 10,000-game database, chosen off-chain and shown for entertainment. **It never affects your result or payout.**
- Everything the contract declares in `quoteRiskParams` (max payout, win probability, expected payout) is derived from the same constants used in `onRandomness`.

## Two ways to play

- **Inside the chain.wtf host:** the page talks to the host only through the SDK bridge. There is no wallet code in this repo.
- **Standalone:** open [chesschuck.vercel.app](https://chesschuck.vercel.app) directly and it boots into demo mode with a simulated 1,000 chUSD balance.

## Tech stack

- **Contract:** Solidity, `ICasinoGameV2` (instant game: `onSessionStart` → `WAITING_RANDOMNESS` → `onRandomness` → `SETTLED`)
- **Frontend:** React + Vite
- **3D board:** Three.js with a GLB scene and Draco decoding
- **Backend:** Supabase (games table, rounds table, Realtime broadcast, and an Edge Function that runs the round clock)
- **Host bridge:** `@chain/casino-sdk` guest bridge
- **Hosting:** Vercel

## Run it locally

```bash
npm install
```

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Then start the dev server:

```bash
npm run dev
```

To test inside the SDK simulator, run the SDK (`npm start` in the SDK folder), copy `contracts/ChessChuckGame.sol` into `simulator/contracts/`, and open the harness at `localhost:3300`.

To build for production:

```bash
npm run build
```

## Project layout

```
├── contracts/ChessChuckGame.sol        Casino game contract
├── public/
│   ├── game.manifest.json              Chain casino SDK manifest
│   ├── assets/                         3D scene and logos
│   └── draco/                          Draco decoder files
├── supabase/functions/game-clock/      Edge Function: round state machine
├── src/
│   ├── App.jsx                         Round state and realtime channel
│   ├── hooks/useCasinoHost.js          SDK bridge and demo-mode detection
│   └── components/
│       ├── ChessBoard.jsx              Three.js board and move animation
│       ├── BettingPanel.jsx            Betting UI and session handling
│       └── StandaloneOverlay.jsx       Standalone explainer page
└── vercel.json                         Hosting headers
```

## Credits

Built by [willzy](https://x.com/justwillzy_) for Chain Jam Vol. 1.
