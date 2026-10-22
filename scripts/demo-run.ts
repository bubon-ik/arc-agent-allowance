/**
 * SingIt Allowance — testnet demo runner
 * Runs three transactions from the deployer wallet (owner = agent):
 *   1. USDC.approve(AgentAllowance, unlimited)         — owner action
 *   2. AgentAllowance.spend(seller, 0.50 USDC)         — should SUCCEED
 *   3. AgentAllowance.spend(seller, 20 USDC)           — should FAIL (PerTxCapExceeded)
 */
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const CHAIN_EXPLORER = 'https://explorer.testnet.arc.io/tx'

const CONTRACT_ADDRESS = '0xc7e39f1c3a6a25375fe5b1eceab4b37ec77ef0b0'
const USDC_ADDRESS     = '0x3600000000000000000000000000000000000000'
const SHOP_SELLER      = '0x61D23AB5376BF1f91295FF3C2D841c8516735450'
const WALLET_ID        = '7816fe3b-4bae-544a-8c72-fd8d2683680b'

const MAX_UINT256    = (2n ** 256n - 1n).toString()
const SPEND_OK       = '500000'      // 0.50 USDC
const SPEND_OVER_CAP = '20000000'    // 20 USDC — exceeds perTxCap of 10

const TERMINAL = new Set(['COMPLETE', 'FAILED', 'DENIED', 'CANCELLED'])

type WalletsClient = ReturnType<typeof initiateDeveloperControlledWalletsClient>

async function pollTx(
  client: WalletsClient,
  txId: string,
  timeoutSec = 90
): Promise<{ state: string; txHash: string | undefined }> {
  const deadline = Date.now() + timeoutSec * 1000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000))
    const res = await client.getTransaction({ id: txId })
    const t = res.data?.transaction
    const state = t?.state ?? 'UNKNOWN'
    const txHash = t?.txHash ?? undefined
    process.stdout.write(`   state=${state}\r`)
    if (state && TERMINAL.has(state)) {
      console.log(`   state=${state}            `)
      return { state, txHash }
    }
  }
  throw new Error(`Timed out waiting for tx ${txId}`)
}

async function sendAndConfirm(
  client: WalletsClient,
  label: string,
  contractAddress: string,
  sig: string,
  params: (string | bigint)[],
  expectFail = false
) {
  const strParams = params.map(p => String(p))
  console.log(`\n${label}`)
  const initRes = await client.createContractExecutionTransaction({
    walletId: WALLET_ID,
    contractAddress,
    abiFunctionSignature: sig,
    abiParameters: strParams,
    idempotencyKey: crypto.randomUUID(),
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } },
  })
  const txId = initRes.data?.id
  if (!txId) throw new Error('No transaction ID returned')
  console.log(`   id: ${txId}`)

  const { state, txHash } = await pollTx(client, txId)
  const explorerUrl = txHash ? `${CHAIN_EXPLORER}/${txHash}` : '(no hash — reverted in simulation)'

  if (expectFail) {
    if (state === 'FAILED') {
      console.log(`   CORRECTLY REJECTED`)
      console.log(`   tx hash  : ${txHash ?? '(none)'}`)
      console.log(`   explorer : ${explorerUrl}`)
    } else {
      console.log(`   UNEXPECTED: expected FAILED but got ${state}`)
      console.log(`   tx hash  : ${txHash ?? '(none)'}`)
    }
  } else {
    if (state !== 'COMPLETE') throw new Error(`Expected COMPLETE but got ${state}`)
    console.log(`   SUCCESS`)
    console.log(`   tx hash  : ${txHash}`)
    console.log(`   explorer : ${explorerUrl}`)
  }

  return { state, txHash }
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY
  const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
  if (!apiKey || !entitySecret) {
    throw new Error('CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in .env')
  }

  const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

  // 1. Approve
  await sendAndConfirm(
    client,
    '[1/3] USDC.approve(AgentAllowance, unlimited)  — owner action',
    USDC_ADDRESS,
    'approve(address,uint256)',
    [CONTRACT_ADDRESS, MAX_UINT256]
  )

  // 2. Successful spend: 0.50 USDC (within 10 USDC perTxCap)
  await sendAndConfirm(
    client,
    '[2/3] spend(seller, 0.50 USDC)  — expected: SUCCEED',
    CONTRACT_ADDRESS,
    'spend(address,uint256)',
    [SHOP_SELLER, SPEND_OK]
  )

  // 3. Over-cap spend: 20 USDC (exceeds 10 USDC perTxCap)
  await sendAndConfirm(
    client,
    '[3/3] spend(seller, 20 USDC)  — expected: FAIL (PerTxCapExceeded)',
    CONTRACT_ADDRESS,
    'spend(address,uint256)',
    [SHOP_SELLER, SPEND_OVER_CAP],
    true   // expectFail
  )

  // Read remaining daily budget via public RPC
  const rpcUrl = 'https://rpc.testnet.arc.io'
  const remainingHex = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{
        to: CONTRACT_ADDRESS,
        // remainingToday() selector: 0x4e68c01e
        data: '0x4e68c01e',
      }, 'latest'],
    }),
  }).then(r => r.json()).then((j: { result: string }) => j.result)

  const remainingRaw = BigInt(remainingHex)
  const remainingUsdc = Number(remainingRaw) / 1e6
  console.log(`\nRemaining daily budget : ${remainingUsdc.toFixed(2)} USDC`)
  console.log('=== Demo complete ===')
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('\nFATAL:', msg)
  process.exit(1)
})
