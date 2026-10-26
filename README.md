# AgentAllowance on Arc

On-chain spending limits for AI agents paying in USDC. Part of [SingIt](https://singitai.app).

An owner funds an agent with a USDC allowance. The agent can only pay through `spend()`, and the contract enforces:

- a **per-transaction cap**,
- a **daily cap** (resets every UTC day),
- an **expiry**,
- **pause / unpause** by the owner.

Anything over a limit reverts with a typed error (`PerTxCapExceeded`, `DailyCapExceeded`, `Expired`, `ContractPaused`, `NotAgent`).

## Arc mainnet deployment

| | |
|---|---|
| Contract | [`0x6f8F11347d6bA250986B65cC7A2C2804170b25dc`](https://explorer.arc.io/address/0x6f8F11347d6bA250986B65cC7A2C2804170b25dc) |
| Token | USDC (`0x3600000000000000000000000000000000000000`) |
| Per-tx cap | 1 USDC |
| Daily cap | 5 USDC |
| Expiry | 2026-11-21 19:32 UTC |

Limits as read from the contract (`perTxCap`, `dailyCap`, `expiry`).

### Mainnet demo run, 23 October 2026

| Step | Result |
|---|---|
| `USDC.approve(contract, 5 USDC)` by the owner | success, block 27498918, [tx](https://explorer.arc.io/tx/0x6b3000235ef6bd1890d9d23d4a68b9a4f4b821c6ca672b9023c2146893740f10) |
| `spend(0.10 USDC)` by the agent | success, block 27499264, [tx](https://explorer.arc.io/tx/0xaa121df8a3ccff87f727486bef925d67c163bfa219d455407706aede8b8fdc87) |
| `spend(2 USDC)` | rejected: `PerTxCapExceeded(2000000, 1000000)` (in simulation, never sent) |

## Arc testnet deployment

| | |
|---|---|
| Contract | [`0xc7e39f1c3a6a25375fe5b1eceab4b37ec77ef0b0`](https://explorer.testnet.arc.io/address/0xc7e39f1c3a6a25375fe5b1eceab4b37ec77ef0b0) |
| Per-tx cap | 10 USDC |
| Daily cap | 50 USDC |
| Demo seller | `0x61D23AB5376BF1f91295FF3C2D841c8516735450` |

### Demo run

| Step | Result |
|---|---|
| `USDC.approve` | [tx](https://explorer.testnet.arc.io/tx/0x3093219d0a2fa15c64b6e7a535dba18aa27bda6d9a45bd8a2267586d0e3b0ed1) |
| `spend(seller, 0.50 USDC)` | success, [tx](https://explorer.testnet.arc.io/tx/0xf2749f1c673ce5e3df900dd047a612c58e8f9872ae1922ae743c673a2a4dccce) |
| `spend(seller, 20 USDC)` | rejected: `PerTxCapExceeded` (in simulation, never sent) |
| `remainingToday()` | 49.50 USDC |

## Contract API

```solidity
function spend(address to, uint256 amount) external;            // agent only
function setLimits(uint256 perTxCap, uint256 dailyCap, uint256 expiry) external; // owner only
function pause() external;                                       // owner only
function unpause() external;                                     // owner only
function remainingToday() external view returns (uint256);
```

## Develop

```bash
bun install
forge test          # 20 tests
bun run dev         # demo shop UI (Vite)
```

Demo shop UI lives in `src/App.tsx`; scripts in `scripts/` (deploy, demo run, tx check).

Secrets (`CIRCLE_API_KEY`, `CIRCLE_ENTITY_SECRET`) are read from a local `.env` and the `.circle/` recovery files; both are gitignored and must never be committed.

Built with [Arc Studio](https://studio.arc.io). Deployed on Arc mainnet and Arc testnet (see above).
