import fs from 'node:fs'

const configPath = process.argv[2]

if (!configPath) {
  console.error('Usage: node scripts/cf-worker-name.mjs <wrangler-json-path>')
  process.exit(1)
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const workerName = typeof config.name === 'string' ? config.name.trim() : ''

if (!workerName) {
  console.error(`Missing Worker name in ${configPath}`)
  process.exit(1)
}

process.stdout.write(workerName)
