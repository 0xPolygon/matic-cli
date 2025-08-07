// noinspection JSUnresolvedVariable

import { loadDevnetConfig } from '../common/config-utils.js'

import {
  runScpCommand,
  runSshCommand,
  maxRetries
} from '../common/remote-worker.js'

import dotenv from 'dotenv'
import fs from 'fs-extra'

export async function sendStateSyncTx() {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const devnetType =
    process.env.TF_VAR_DOCKERIZED === 'yes' ? 'docker' : 'remote'

  const doc = await loadDevnetConfig(devnetType)
  let machine0
  if (doc.numOfBorValidators > 0) {
    machine0 = doc.devnetBorHosts[0]
    console.log('📍Monitoring the first node', doc.devnetBorHosts[0])
  } else if (devnetType === 'remote') {
    machine0 = doc.devnetErigonHosts[0]
    console.log('📍Monitoring the first node', doc.devnetErigonHosts[0])
  } else {
    console.log('📍No nodes to monitor, please check your configs! Exiting...')
    process.exit(1)
  }

  let src = `${doc.ethHostUser}@${machine0}:~/matic-cli/devnet/devnet/signer-dump.json`
  let dest = './signer-dump.json'
  await runScpCommand(src, dest, maxRetries)

  const signerDump = JSON.parse(
    fs.readFileSync(`${process.cwd()}/signer-dump.json`, 'utf8')
  )

  src = `${doc.ethHostUser}@${machine0}:~/matic-cli/devnet/code/pos-contracts/contractAddresses.json`
  dest = './contractAddresses.json'
  await runScpCommand(src, dest, maxRetries)

  const contractAddresses = JSON.parse(
    fs.readFileSync(`${process.cwd()}/contractAddresses.json`, 'utf8')
  )

  const MaticToken = contractAddresses.root.tokens.MaticToken

  console.log('📍Sending StateSync Tx')

  const command = `export PATH="$HOME/.foundry/bin:$PATH" && cd ~/matic-cli/devnet/code/pos-contracts && forge script scripts/matic-cli-scripts/Deposit.s.sol:MaticDeposit --legacy --rpc-url http://localhost:9545 --private-key ${signerDump[0].priv_key} --broadcast --sig "run(address,address,uint256)" ${signerDump[0].address} ${MaticToken} 100000000000000000000`
  await runSshCommand(`${doc.ethHostUser}@${machine0}`, command, maxRetries)

  console.log(
    '📍StateSync Tx Sent, check with "../../bin/express-cli.js --monitor"'
  )
}
