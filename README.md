# AgentAllowance on Arc

On-chain spending limits for AI agents paying in USDC. Part of [SingIt](https://singitai.app).

An owner funds an agent with a USDC allowance. The agent can only pay through `spend()`, and the contract enforces:

- a **per-transaction cap**,
- a **daily cap** (resets every UTC day),
- an **expiry**,
- **pause / unpause** by the owner.

Anything over a limit reverts with a typed error (`PerTxCapExceeded`, `DailyCapExceeded`, `Expired`, `ContractPaused`, `NotAgent`).

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

Built with [Arc Studio](https://studio.arc.io). Testnet only.
