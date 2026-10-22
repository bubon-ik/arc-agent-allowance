/**
 * One-time setup: create a wallet set + wallet for the SingIt demo.
 * Run: bun run scripts/setup-demo-wallet.ts
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const apiKey      = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
if (!apiKey || !entitySecret) { console.error('Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET'); process.exit(1) }

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

// Create a wallet set
const wsRes = await client.createWalletSet({
  name: 'SingIt Demo',
  idempotencyKey: crypto.randomUUID(),
})
const walletSetId = wsRes.data?.walletSet?.id
if (!walletSetId) throw new Error('No walletSetId returned')
console.log('walletSetId:', walletSetId)

// Create one EVM wallet on ARC-TESTNET
const wRes = await client.createWallets({
  walletSetId,
  blockchains: ['ARC-TESTNET'],
  count: 1,
  idempotencyKey: crypto.randomUUID(),
})
const wallet = wRes.data?.wallets?.[0]
if (!wallet) throw new Error('No wallet returned')
console.log('walletId  :', wallet.id)
console.log('address   :', wallet.address)
