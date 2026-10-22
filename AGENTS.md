# SingIt Allowance

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

USDC spending limit controller for an AI agent on Arc Testnet. The contract never holds tokens; the owner approves USDC to the contract address and the agent calls `spend()` which uses `transferFrom(owner, to, amount)`.

## Deployed Contract (current)

- **Name**: AgentAllowance
- **Address**: `0xc7e39f1c3a6a25375fe5b1eceab4b37ec77ef0b0`
- **Chain**: Arc Testnet (Chain ID 5042002)
- **Explorer**: https://explorer.testnet.arc.io/address/0xc7e39f1c3a6a25375fe5b1eceab4b37ec77ef0b0
- **Owner / Agent**: `0x966c115a4a3762495fcd140591eab6ab458f611b` (developer-controlled wallet, walletId `7816fe3b-4bae-544a-8c72-fd8d2683680b`)
- **Token (USDC)**: `0x3600000000000000000000000000000000000000`
- **perTxCap**: 10 USDC (10_000_000)
- **dailyCap**: 50 USDC (50_000_000)
- **Expiry**: Oct 22 2027 (Unix 1824768000)

## SingIt Demo Shop

- **Seller address**: `0x61D23AB5376BF1f91295FF3C2D841c8516735450`
- Items: API Call Bundle 0.50 USDC, eSIM 1 GB 3.00 USDC, Gift Card $5 5.00 USDC

## Live Demo Transactions (Arc Testnet, Oct 22 2026)

- **Approve** (USDC → contract, unlimited): `0x3093219d0a2fa15c64b6e7a535dba18aa27bda6d9a45bd8a2267586d0e3b0ed1`
- **Successful spend** (API Call 0.50 USDC): `0xf2749f1c673ce5e3df900dd047a612c58e8f9872ae1922ae743c673a2a4dccce`
- **Rejected spend** (20 USDC over perTxCap): reverted in simulation — no on-chain hash (PerTxCapExceeded)
- **Remaining daily budget after demo**: 49.50 USDC (spentToday = 0.50 USDC)

## Previous Deployment (superseded)

- Address: `0x68cd950fd10b95833afc48f70f903537026f8cc2` (owner was platform deployer, not accessible under new entity)

## Security

Full security review run at max severity before deploy. All findings resolved: SafeERC20, immutables for owner/agent/token, contextual custom errors, ReentrancyGuard + strict CEI. 20/20 unit tests pass.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
