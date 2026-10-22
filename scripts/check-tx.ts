import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const apiKey = process.env.CIRCLE_API_KEY
const entitySecret = process.env.CIRCLE_ENTITY_SECRET ?? process.env.ENTITY_SECRET
if (!apiKey || !entitySecret) { process.exit(1) }

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })

const txId = process.argv[2]
if (!txId) { console.error('Usage: bun run scripts/check-tx.ts <txId>'); process.exit(1) }

const res = await client.getTransaction({ id: txId })
console.log(JSON.stringify(res.data?.transaction, null, 2))
