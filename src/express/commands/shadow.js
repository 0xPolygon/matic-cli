import Web3 from 'web3'
import { loadDevnetConfig, splitToArray } from '../common/config-utils.js'
import { maxRetries, runSshCommand } from '../common/remote-worker.js'
import { stopServices } from './cleanup.js'
import { isValidPositiveNum } from '../common/num-utils.js'

import fs from 'fs'
import dotenv from 'dotenv'
async function initWeb3(provider) {
  return new Web3(provider)
}

export async function shadow(targetBlock) {
  const doc = await loadDevnetConfig('remote')
  if (!doc.devnetBorHosts) {
    console.log(
      '❌ This command is not yet supported for Erigon devnets! Exiting ...'
    )
    process.exit(1)
  }
  if (!isValidPositiveNum(targetBlock)) {
    console.log('❌ Invalid [blockNumber] parameter! Exiting ...')
    process.exit(1)
  }
  dotenv.config({ path: `${process.cwd()}/.env` })
  const borUsers = splitToArray(doc.devnetBorUsers.toString())
  const providerToNodeIp = new Map()
  let ip
  let shadowBorChainId
  let latestBlock
  let provider
  const providers = []

  for (let i = 0; i < doc.devnetBorHosts.length; i++) {
    ip = `${borUsers[i]}@${doc.devnetBorHosts[i]}`
    provider = await initWeb3(`ws://${doc.devnetBorHosts[i]}:8546`)
    latestBlock = await provider.eth.getBlock('latest')
    if (latestBlock.number > targetBlock) {
      console.log(
        `📍Latest block already past ${targetBlock} on machine ${ip}! Skipping machine ...`
      )
      continue
    }
    providers.push(provider)
    providerToNodeIp.set(provider, ip)
  }

  if (providers.length === 0) {
    console.log('❌ All the machines are past the target block! Exiting ...')
    process.exit(1)
  }
  const shadowGenesisLocation = '/var/lib/bor/shadow-genesis.json'
  const startScriptLocation = '~/node/bor-start.sh'
  const launchFolder =
    process.env.NETWORK === 'mainnet' ? 'mainnet-v1' : 'amoy-v1'
  const genesisCmd = `curl -o ${shadowGenesisLocation} https://raw.githubusercontent.com/0xPolygon/launch/master/${launchFolder}/sentry/validator/bor/genesis.json`

  shadowBorChainId = process.env.SHADOW_CHAIN_ID
  if (!shadowBorChainId) {
    shadowBorChainId = Math.floor(Math.random() * 10000 + 1000)
  }

  // eslint-disable-next-line
  const updateGenesisChainIdCmd = `sed -i '/\"chainId\"/c\   \   "chainId\": ${shadowBorChainId},' ${shadowGenesisLocation}`
  // eslint-disable-next-line
  const updateBorStartScriptCmd = `sed -i "s|${process.env.NETWORK}|\\$BOR_HOME/shadow-genesis.json|g" ${startScriptLocation}`
  // eslint-disable-next-line
  const addFlagsCmd = `sed -i 's/--mine$/--mine \\\\\\\n  --bor.withoutheimdall \\\\\\\n  --bor.devfakeauthor \\\\\\\n  --rpc.allow-unprotected-txs \\\\/' ${startScriptLocation}`
  const restartBorCmd = 'sudo service bor restart'

  const shadowTasks = providers.map(async (p) => {
    while (true) {
      const currentBlock = await p.eth.getBlock('latest')
      // eslint-disable-next-line
      if (currentBlock.number === Number(targetBlock)) {
        break
      }
    }
    await stopServices(doc)

    console.log('📍Downloading and modifying genesis on machines ... ')
    await runSshCommand(providerToNodeIp.get(p), genesisCmd, maxRetries)
    await runSshCommand(
      providerToNodeIp.get(p),
      updateGenesisChainIdCmd,
      maxRetries
    )

    console.log('📍Updating start script on machines ... ')
    await runSshCommand(
      providerToNodeIp.get(p),
      updateBorStartScriptCmd,
      maxRetries
    )
    await runSshCommand(providerToNodeIp.get(p), addFlagsCmd, maxRetries)

    console.log('📍Restarting bor on machines ... ')
    await runSshCommand(providerToNodeIp.get(p), restartBorCmd, maxRetries)
  })

  await Promise.all(shadowTasks)

  try {
    const blockData = JSON.stringify({
      blockNumber: targetBlock
    })
    if (!fs.existsSync('shadowData')) {
      fs.mkdirSync('shadowData')
    }
    fs.writeFileSync('./shadowData/blockData.json', blockData, 'utf-8')
  } catch (error) {
    console.error(`Error occurred while writing block number to file: ${error}`)
    process.exit(1)
  }
}
