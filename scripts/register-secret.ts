/**
 * One-time entity secret registration.
 * Run with: bun run scripts/register-secret.ts
 * NEVER commit this file's output or the .env values it writes.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { registerEntitySecretCiphertext, initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets'

const apiKey = process.env.CIRCLE_API_KEY
if (!apiKey) { console.error('CIRCLE_API_KEY not set'); process.exit(1) }

// Generate secret without printing it
const entitySecret = crypto.randomBytes(32).toString('hex')

// Register with Circle
const recoveryDir = '/home/user/app/.circle'
fs.mkdirSync(recoveryDir, { recursive: true })

console.log('Registering entity secret ciphertext with Circle…')
const response = await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryDir,
})

const recoveryPath = path.join(recoveryDir, 'recovery_file.dat')
if (response.data?.recoveryFile) {
  fs.writeFileSync(recoveryPath, response.data.recoveryFile)
}

// Persist to .env
const envPath = '/home/user/app/.env'
fs.appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`, 'utf-8')

// Verify registration
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret })
await client.listWalletSets({ pageSize: 1 })

console.log('OK: entity secret registered and verified.')
console.log(`Recovery file written to: ${recoveryPath}`)
