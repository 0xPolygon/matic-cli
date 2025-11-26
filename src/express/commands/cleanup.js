import {
  loadDevnetConfig,
  returnTotalBorNodes,
  splitToArray
} from '../common/config-utils.js'
import { maxRetries, runSshCommand } from '../common/remote-worker.js'
import { timer } from '../common/time-utils.js'
import dotenv from 'dotenv'

export async function cleanup() {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const doc = await loadDevnetConfig('remote')

  await stopServices(doc)
  await cleanupServices(doc)
  await startServices(doc)
  await deployBorContractsAndStateSync(doc)
}

export async function stopServices(doc) {
  const totalHosts = []
  const totalUsers = []
  const nodeIps = []
  if (doc.devnetBorHosts) {
    totalHosts.push(...splitToArray(doc.devnetBorHosts.toString()))
  }
  if (doc.devnetErigonHosts) {
    totalHosts.push(...splitToArray(doc.devnetErigonHosts.toString()))
  }

  if (doc.devnetBorUsers) {
    totalUsers.push(...splitToArray(doc.devnetBorUsers.toString()))
  }
  if (doc.devnetErigonUsers) {
    totalUsers.push(...splitToArray(doc.devnetErigonUsers.toString()))
  }

  let ip
  const isHostMap = new Map()
  const hostToIndexMap = new Map()

  for (let i = 0; i < totalHosts.length; i++) {
    /* eslint-disable */
    ip = `${totalUsers[i]}@${totalHosts[i]}`
    hostToIndexMap.set(ip, i)
    nodeIps.push(ip)
    if (
      (i === 0 && parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) > 0) ||
      (i === returnTotalBorNodes(doc) &&
        parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) === 0)
    ) {
      isHostMap.set(ip, true)
    } else {
      isHostMap.set(ip, false)
    }
    /* eslint-disable */
  }

  let command
  const stopServiceTasks = nodeIps.map(async (ip) => {
    if (isHostMap.get(ip)) {
      console.log('📍Stopping anvil on machine ' + ip + ' ...')
      command =
        'sudo systemctl stop anvil.service || echo "anvil not running on current machine..."'
      await runSshCommand(ip, command, maxRetries)
    }

    if (hostToIndexMap.get(ip) < returnTotalBorNodes(doc)) {
      console.log('📍Stopping bor on machine ' + ip + ' ...')
      command =
        'sudo systemctl stop bor.service || echo "bor not running on current machine..."'
      await runSshCommand(ip, command, maxRetries)
    } else {
      console.log('📍Stopping erigon on machine ' + ip + ' ...')
      command =
        'sudo systemctl stop erigon.service || echo "erigon not running on current machine..."'
      await runSshCommand(ip, command, maxRetries)
    }
    console.log('📍Stopping heimdall on machine ' + ip + '...')
    command =
      'sudo systemctl stop heimdalld.service || echo "heimdall not running on current machine..."'
    await runSshCommand(ip, command, maxRetries)
  })

  await Promise.all(stopServiceTasks)
}

async function cleanupServices(doc) {
  const totalHosts = []
  const totalUsers = []
  const nodeIps = []
  if (doc.devnetBorHosts) {
    totalHosts.push(...splitToArray(doc.devnetBorHosts.toString()))
  }
  if (doc.devnetErigonHosts) {
    totalHosts.push(...splitToArray(doc.devnetErigonHosts.toString()))
  }

  if (doc.devnetBorUsers) {
    totalUsers.push(...splitToArray(doc.devnetBorUsers.toString()))
  }
  if (doc.devnetErigonUsers) {
    totalUsers.push(...splitToArray(doc.devnetErigonUsers.toString()))
  }

  let ip
  const isHostMap = new Map()
  const hostToIndexMap = new Map()

  for (let i = 0; i < totalHosts.length; i++) {
    ip = `${totalUsers[i]}@${totalHosts[i]}`
    hostToIndexMap.set(ip, i)
    nodeIps.push(ip)
    if (
      (i === 0 && parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) > 0) ||
      (i === returnTotalBorNodes(doc) &&
        parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) === 0)
    ) {
      isHostMap.set(ip, true)
    } else {
      isHostMap.set(ip, false)
    }
  }

  let command
  const cleanupServicesTasks = nodeIps.map(async (ip) => {
    if (isHostMap.get(ip)) {
      console.log('📍Cleaning up anvil on machine ' + ip + ' ...')
      command =
        'rm -rf ~/data/anvil-db && rm -rf ~/matic-cli/devnet/data/anvil-db'
      await runSshCommand(ip, command, maxRetries)
    }

    console.log('📍Cleaning up bridge storage on machine ' + ip + ' ...')
    command = 'rm -rf /var/lib/heimdall/bridge'
    await runSshCommand(ip, command, maxRetries)

    if (hostToIndexMap.get(ip) < returnTotalBorNodes(doc)) {
      console.log('📍Cleaning up bor on machine ' + ip + ' ...')
      command = 'rm -rf /var/lib/bor/data'
      await runSshCommand(ip, command, maxRetries)
    } else {
      console.log('📍Cleaning up erigon on machine ' + ip + ' ...')
      command = 'rm -rf ~/.erigon/data'
      await runSshCommand(ip, command, maxRetries)
    }
  })

  await Promise.all(cleanupServicesTasks)
}

async function startServices(doc) {
  const totalHosts = []
  const totalUsers = []
  const nodeIps = []
  if (doc.devnetBorHosts) {
    totalHosts.push(...splitToArray(doc.devnetBorHosts.toString()))
  }
  if (doc.devnetErigonHosts) {
    totalHosts.push(...splitToArray(doc.devnetErigonHosts.toString()))
  }

  if (doc.devnetBorUsers) {
    totalUsers.push(...splitToArray(doc.devnetBorUsers.toString()))
  }
  if (doc.devnetErigonUsers) {
    totalUsers.push(...splitToArray(doc.devnetErigonUsers.toString()))
  }
  let ip
  const isHostMap = new Map()
  const hostToIndexMap = new Map()

  for (let i = 0; i < totalHosts.length; i++) {
    ip = `${totalUsers[i]}@${totalHosts[i]}`
    hostToIndexMap.set(ip, i)
    nodeIps.push(ip)
    if (
      (i === 0 && doc.numOfBorValidators > 0) ||
      (i === returnTotalBorNodes(doc) && doc.numOfBorValidators === 0)
    ) {
      isHostMap.set(ip, true)
    } else {
      isHostMap.set(ip, false)
    }
  }

  let command
  const startServicesTasks = nodeIps.map(async (ip) => {
    if (isHostMap.get(ip)) {
      console.log('📍Running anvil in machine ' + ip + ' ...')
      command = 'sudo systemctl start anvil.service'
      await runSshCommand(ip, command, maxRetries)

      console.log(
        '📍Deploying main net contracts dependencies on machine ' + ip + ' ...'
      )
      command = 'cd ~/matic-cli/devnet && bash anvil-deploy-dependencies.sh'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Deploying main net contracts on machine ' + ip + ' ...')
      command = 'cd ~/matic-cli/devnet && bash anvil-deployment.sh'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Setting up validators on machine ' + ip + ' ...')
      command = 'cd ~/matic-cli/devnet && bash anvil-stake.sh'
      await runSshCommand(ip, command, maxRetries)
    }

    console.log('📍Setting up heimdall on machine ' + ip + ' ...')
    command = 'bash ~/node/heimdalld-setup.sh'
    await runSshCommand(ip, command, maxRetries)

    console.log('📍Starting heimdall on machine ' + ip + ' ...')
    command = 'sudo systemctl start heimdalld.service'
    await runSshCommand(ip, command, maxRetries)

    if (hostToIndexMap.get(ip) < returnTotalBorNodes(doc)) {
      console.log('📍Setting bor on machine ' + ip + ' ...')
      command = 'bash ~/node/bor-setup.sh'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Starting bor on machine ' + ip + ' ...')
      command = 'sudo systemctl start bor.service'
      await runSshCommand(ip, command, maxRetries)
    } else {
      console.log('📍Setting erigon on machine ' + ip + ' ...')
      command = 'bash ~/node/erigon-setup.sh'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Starting erigon on machine ' + ip + ' ...')
      command = 'sudo systemctl start erigon.service'
      await runSshCommand(ip, command, maxRetries)
    }
  })

  await Promise.all(startServicesTasks)
}

async function deployBorContractsAndStateSync(doc) {
  const user = `${doc.ethHostUser}`
  let borHosts, erigonHosts
  if (doc.devnetBorHosts) {
    borHosts = splitToArray(doc.devnetBorHosts.toString())
  }
  if (doc.devnetErigonHosts) {
    erigonHosts = splitToArray(doc.devnetErigonHosts.toString())
  }
  const host = doc.numOfBorValidators > 0 ? borHosts[0] : erigonHosts[0]
  const ip = `${user}@${host}`

  console.log('📍Deploying contracts for bor on machine ' + ip + ' ...')
  await timer(60000)
  let command = 'cd ~/matic-cli/devnet && bash anvil-deployment-bor.sh'
  await runSshCommand(ip, command, maxRetries)

  console.log('📍Deploying state-sync contracts on machine ' + ip + ' ...')
  await timer(60000)
  command = 'cd ~/matic-cli/devnet && bash anvil-deployment-sync.sh'
  await runSshCommand(ip, command, maxRetries)
}
