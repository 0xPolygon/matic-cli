/* eslint-disable dot-notation */
import { loadDevnetConfig, splitToArray } from '../common/config-utils.js'
import { checkLatestMilestone } from '../commands/monitor.js'
import { timer } from './time-utils.js'

import {
  runSshCommand,
  maxRetries,
  runSshCommandWithReturn,
  runCommand
} from '../common/remote-worker.js'
import dotenv from 'dotenv'

export async function getUsersAndHosts() {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const devnetType =
    process.env.TF_VAR_DOCKERIZED === 'yes' ? 'docker' : 'remote'

  const doc = await loadDevnetConfig(devnetType)

  const borUsers = splitToArray(doc['devnetBorUsers'].toString())
  const borHosts = splitToArray(doc['devnetBorHosts'].toString())

  return {
    borUsers,
    borHosts
  }
}

export async function getIpsAndEnode(borUsers, borHosts) {
  const tasks = []
  let enodes = []
  const ips = []
  for (let i = 0; i < borUsers.length; i++) {
    const ip = `${borUsers[i]}@${borHosts[i]}`
    ips.push(ip)
    tasks.push(getEnode(borUsers[i], borHosts[i]))
  }

  await Promise.all(tasks).then((values) => {
    enodes = values
  })

  if (enodes.includes('')) {
    console.log('📍Unable to fetch enode, exiting')
    process.exit(1)
  }

  return {
    ips,
    enodes
  }
}

export async function getBlock(ip, number = 'latest') {
  const url = `http://${ip}:8545`
  if (number !== 'latest' && number !== 'finalized') {
    number = '0x' + Number(number).toString(16) // hexify
  }

  const opts = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockByNumber',
    params: [number, false]
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  })

  const responseJson = await response.json()
  if (responseJson.result) {
    return responseJson.result
  } else {
    console.log(
      `📍Error fetching block. number: ${number}, opts: ${JSON.stringify(opts)}`
    )
    console.log('📍Response received:', responseJson)
  }

  return undefined
}

export async function getMiner(ip, number) {
  const url = `http://${ip}:8545`
  number = '0x' + Number(number).toString(16) // hexify

  const opts = {
    jsonrpc: '2.0',
    id: 1,
    method: 'bor_getAuthor',
    params: [number]
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts)
  })

  const responseJson = await response.json()
  if (responseJson.result) {
    return responseJson.result
  } else {
    console.log(
      `📍Error fetching miner. number: ${number}, response: ${JSON.stringify(
        response
      )}, opts: ${JSON.stringify(opts)}`
    )
  }

  return undefined
}

export async function checkForRewind(ip) {
  const command =
    'journalctl -u bor -n 1000 | grep "Rewinding blockchain" | wc -l'
  try {
    const count = await runSshCommandWithReturn(ip, command, maxRetries)
    // console.log('📍Fetched count of rewind logs, count:', count)
    if (Number(count) === 1) {
      console.log('📍Chain got to correct fork with Rewind')
    } else {
      console.log('📍Chain got to correct fork without Rewind, count:', count)
    }
  } catch (error) {
    console.log('📍Unable to fetch count of rewind logs, error:', error)
  }
}

async function getValidatorInfo(ip) {
  const command =
    'echo `cat $HOME/matic-cli/devnet/code/genesis-contracts/validators.json`'
  try {
    const validators = await runSshCommandWithReturn(ip, command, maxRetries)
    return JSON.parse(validators)
  } catch (error) {
    console.log('📍Unable to get validator info, error:', error)
  }

  return undefined
}

export async function validateProposer(ip, proposer) {
  const validators = await getValidatorInfo(ip)
  try {
    if (validators) {
      // Skip the validator from cluster 1
      for (let i = 1; i < validators.length; i++) {
        if (
          String(proposer).toLowerCase() ===
          String(validators[i].address).toLowerCase()
        ) {
          console.log('📍Validated milestone proposer')
          return
        }
      }

      console.log(
        '📍Invalid milestone got proposed from validator/s of cluster 1'
      )
      console.log(
        '📍Milestone proposer:',
        proposer,
        ', validators: ',
        validators
      )
    }
  } catch (error) {
    console.log(
      '📍Error in validating milestone proposer, skipping check. Error:',
      error
    )
  }
}

export async function removePeers(ip, peers) {
  const tasks = []
  for (let i = 0; i < peers.length; i++) {
    const command = `~/go/bin/bor attach /var/lib/bor/data/bor.ipc --exec "admin.removePeer('${peers[i]}')"`
    tasks.push(runSshCommand(ip, command, maxRetries))
  }

  let response = false
  await Promise.all(tasks)
    .then(() => {
      response = true
    })
    .catch((error) => {
      console.log('📍Unable to remove peers, error:', error)
    })

  return response
}

export async function addPeers(ip, peers) {
  const tasks = []
  for (let i = 0; i < peers.length; i++) {
    const command = `~/go/bin/bor attach /var/lib/bor/data/bor.ipc --exec "admin.addPeer('${peers[i]}')"`
    tasks.push(runSshCommand(ip, command, maxRetries))
  }

  let response = false
  await Promise.all(tasks)
    .then(() => {
      response = true
    })
    .catch((error) => {
      console.log('📍Unable to add peers, error:', error)
    })

  return response
}

export async function getPeerLength(ip) {
  const command =
    '~/go/bin/bor attach /var/lib/bor/data/bor.ipc --exec "admin.peers.length"'
  try {
    const length = await runSshCommandWithReturn(ip, command, maxRetries)
    return parseInt(length)
  } catch (error) {
    console.log('📍Unable to query peer length, error:', error)
  }

  return -1
}

export async function joinAllPeers(ips, enodes) {
  let tasks = []
  for (let i = 0; i < ips.length; i++) {
    tasks.push(addPeers(ips[i], enodes))
  }

  await Promise.all(tasks).then((values) => {
    if (values.includes(false) || values.includes(undefined)) {
      console.log('📍Failed to add peers for rejoining clusters')
      return false
    }
  })

  // Validate by fetching peer length
  tasks = []
  for (let i = 0; i < ips.length; i++) {
    tasks.push(getPeerLength(ips[i]))
  }

  let lengths
  await Promise.all(tasks).then((values) => {
    lengths = values
  })

  if (!lengths) {
    await timer(100)
    if (!lengths) {
      return false
    }
  }

  if (lengths.includes(-1)) {
    console.log('📍Unable to query peer length, exiting')
    return false
  }

  console.log('📍Peer length:', lengths)
  return true
}

export async function createClusters(ips, enodes, split = 1) {
  // `split` defines how clusters are created and which index to use to separate nodes.
  // e.g. for a 4-nodes devnet, with split = 1, clusters created would be of 1 and 3 nodes (nodes[:split], nodes[split:])
  const tasks = []
  const ips1 = ips.slice(0, split)
  const ips2 = ips.slice(split)
  for (let i = 0; i < ips1.length; i++) {
    tasks.push(removePeers(ips1[i], enodes.slice(split)))
  }
  for (let i = 0; i < ips2.length; i++) {
    tasks.push(removePeers(ips2[i], enodes.slice(0, split)))
  }

  let response = false
  await Promise.all(tasks)
    .then((values) => {
      if (values.includes(false) || values.includes(undefined)) {
        console.log('📍Unable to remove peers, exiting')
      } else {
        response = true
      }
    })
    .catch((error) => {
      console.log('📍Unable to remove peers, error:', error)
    })

  if (response === false) {
    console.log('📍Unable to create clusters, exiting')
    process.exit(1)
  }

  await timer(100)

  const expectedPeers = Array(ips.length).fill(split - 1)
  expectedPeers.fill(ips.length - split - 1, split)

  return await validateClusters(ips, expectedPeers)
}

export async function validateClusters(ips, expectedPeers) {
  const tasks = []
  for (let i = 0; i < ips.length; i++) {
    tasks.push(getPeerLength(ips[i]))
  }

  let peers = []
  await Promise.all(tasks).then((values) => {
    // Check if there's no validation error
    if (values.includes(-1)) {
      console.log('📍Unable to query peer length, exiting')
      process.exit(1)
    }
    peers = values
  })

  await timer(100)

  if (JSON.stringify(peers) === JSON.stringify(expectedPeers)) {
    return true
  }

  console.log(`Peer length mismatch, got: ${peers}, expected: ${expectedPeers}`)
  return false
}

export async function getEnode(user, host) {
  const ip = `${user}@${host}`
  const command =
    '~/go/bin/bor attach /var/lib/bor/data/bor.ipc --exec admin.nodeInfo.enode'
  try {
    const fullEnode = await runSshCommandWithReturn(ip, command, maxRetries)
    let enode = String(fullEnode).split('@')[0].slice(1) // remove the local ip from the enode
    if (enode.length !== 136) {
      // prefix "enode://" + 128 hex values for enode itself
      return ''
    }
    enode += '@' + host + ':30303' // assuming that p2p port is opened on 30303
    return enode
  } catch (error) {
    console.log(`📍Unable to query enode. Error: ${error}`)
  }

  return ''
}

export async function validateFinalizedBlock(hosts, milestone) {
  // Fetch the last 'finalized' block from all nodes
  const tasks = []
  for (let i = 0; i < hosts.length; i++) {
    tasks.push(runCommand(getBlock, hosts[i], 'finalized', maxRetries))
  }

  let finalizedBlocks = []
  await Promise.all(tasks).then((values) => {
    // Check if there's empty value
    if (values.includes(undefined)) {
      console.log(
        `📍Error in fetching last finalized block, responses: ${values}, exiting`
      )
      process.exit(1)
    }
    finalizedBlocks = values
  })

  await timer(100)

  // Check if the number and hash matches with the last milestone
  for (let i = 0; i < finalizedBlocks.length; i++) {
    if (
      Number(finalizedBlocks[i].number) !== Number(milestone.end_block) ||
      finalizedBlocks[i].hash !== milestone.hash
    ) {
      console.log(
        `📍Block number or hash mismatch for finalized block. Host index: ${i}, Finalized Block Number: ${Number(
          finalizedBlocks[i].number
        )}, Hash: ${finalizedBlocks[i].hash}. Milestone end block: ${Number(
          milestone.end_block
        )}, Hash: ${milestone.hash} exiting`
      )
      process.exit(1)
    }
  }

  return true
}

export async function fetchLatestMilestone(
  milestoneLength,
  queryTimer,
  host,
  lastMilestone = undefined
) {
  let milestone
  let count = 0
  console.log('📍Querying heimdall for next milestone...')
  while (true) {
    if (count !== 0) {
      await timer(queryTimer)
    }
    count++

    if (count > milestoneLength) {
      console.log(
        `📍Unable to fetch milestone from heimdall after ${count} tries`
      )
      return undefined
    }

    milestone = await checkLatestMilestone(host)
    if (milestone.milestone) {
      // Check against last milestone (if present) if it's immediate next one or not
      if (lastMilestone) {
        if (
          Number(milestone.milestone.start_block) ===
          Number(lastMilestone.end_block) + 1
        ) {
          break
        } else {
          console.log('📍Waiting for new milestone...')
          continue
        }
      }
      break
    } else {
      console.log(
        `📍Invalid milestone received. Response: ${JSON.stringify(
          milestone.milestone
        )}, count: ${count}`
      )
    }
  }

  const latestMilestone = milestone.milestone
  console.log(
    `📍Got milestone from heimdall. Start block: ${Number(
      latestMilestone.start_block
    )}, End block: ${Number(latestMilestone.end_block)}, ID: ${
      latestMilestone.milestone_id
    }, Hash: ${latestMilestone.hash}`
  )
  return latestMilestone
}

// queryMilestone keeps querying new milestones for `maxRetries` times
export async function queryMilestone(maxRetries, queryTimer, host) {
  let milestone
  let count = 0
  console.log('📍Querying heimdall for next milestone, maxRetries:', maxRetries)
  while (count <= maxRetries) {
    if (count !== 0) {
      await timer(queryTimer)
    }
    count++

    milestone = await checkLatestMilestone(host)
    if (milestone.result) {
      const latestMilestone = milestone.result
      console.log(
        `📍Got milestone from heimdall. Start block: ${Number(
          latestMilestone.start_block
        )}, End block: ${Number(latestMilestone.end_block)}, ID: ${
          latestMilestone.milestone_id
        }, Hash: ${latestMilestone.hash}, count: ${count}`
      )
    } else {
      console.log(
        `📍Invalid milestone received. Response: ${JSON.stringify(
          milestone.result
        )}, count: ${count}`
      )
    }
  }
}

// fetchAndValidateSameHeightBlocks attempts to fetch same (by height) blocks
// from different clusters and validates them. Ideally they should have same
// block number but different hash.
export async function fetchAndValidateSameHeightBlocks(
  host1,
  host2,
  type = 'base'
) {
  // We'll fetch block from cluster 2 first as it'll be behind in terms of block height
  console.log('📍Attempting to fetch latest block from cluster 2')
  const latestBlockCluster2 = await runCommand(
    getBlock,
    host2,
    'latest',
    maxRetries
  )
  if (
    latestBlockCluster2 === undefined ||
    latestBlockCluster2.number === undefined
  ) {
    console.log(
      '📍Unable to fetch latest block in cluster 2, exiting',
      latestBlockCluster2
    )
    process.exit(1)
  }

  console.log(
    `📍Attempting to fetch block ${Number(
      latestBlockCluster2.number
    )} from cluster 1`
  )
  const latestBlockCluster1 = await runCommand(
    getBlock,
    host1,
    latestBlockCluster2.number,
    maxRetries
  )
  if (
    latestBlockCluster1 === undefined ||
    latestBlockCluster1.number === undefined
  ) {
    console.log(
      `📍Unable to fetch block ${Number(
        latestBlockCluster2.number
      )} in cluster 1, exiting`
    )
    process.exit(1)
  }

  // Check for same block number
  if (latestBlockCluster1.number !== latestBlockCluster2.number) {
    console.log(
      `📍Block number mismatch from clusters. Cluster 1: ${Number(
        latestBlockCluster1.number
      )}, Cluster 2: ${Number(latestBlockCluster2.number)}, exiting`
    )
    process.exit(1)
  }

  // Check if same block numbers have different hash or not
  if (latestBlockCluster1.hash === latestBlockCluster2.hash) {
    console.log(
      `📍Block hash matched. Clusters are not created properly. Cluster 1: ${latestBlockCluster1.hash}, Cluster 2: ${latestBlockCluster2.hash}, exiting`
    )
    process.exit(1)
  }

  console.log(
    `📍Same block found with different hash. Block number: ${Number(
      latestBlockCluster1.number
    )}, Cluster 1 hash: ${latestBlockCluster1.hash}, Cluster 2 hash: ${
      latestBlockCluster2.hash
    }`
  )

  // Return blocks from cluster 2 as it will be considered canonical
  if (type === 'base') {
    return latestBlockCluster2
  }

  // For partition tests, return cluster 1 as it will be canonical
  return latestBlockCluster1
}

// fetchAndValidateSameBlocks attempts to fetch same (by height) blocks
// from different clusters and validates them. Ideally they should have same
// block number and same hash.
export async function fetchAndValidateSameBlocks(host1, host2) {
  // We'll fetch block from cluster 2 first as it'll be behind in terms of block height
  console.log('📍Attempting to fetch latest block from cluster 1')
  const latestBlockCluster1 = await runCommand(
    getBlock,
    host1,
    'latest',
    maxRetries
  )
  if (
    latestBlockCluster1 === undefined ||
    latestBlockCluster1.number === undefined
  ) {
    console.log('📍Unable to fetch latest block in cluster 1, exiting')
    process.exit(1)
  }

  let count = 0
  let latestBlockCluster2
  while (count <= 10) {
    count++
    console.log(
      `📍Attempting to fetch block ${Number(
        latestBlockCluster1.number
      )} from cluster 2, count: ${count}`
    )
    latestBlockCluster2 = await runCommand(
      getBlock,
      host2,
      latestBlockCluster1.number,
      maxRetries
    )
    if (
      latestBlockCluster2 === undefined ||
      latestBlockCluster2.number === undefined
    ) {
      console.log(
        `📍Unable to fetch block ${Number(
          latestBlockCluster1.number
        )} in cluster 2`
      )
    } else {
      break
    }
  }

  if (
    latestBlockCluster2 === undefined ||
    latestBlockCluster2.number === undefined
  ) {
    console.log(
      `📍Unable to fetch block ${Number(
        latestBlockCluster1.number
      )} in cluster 2, exiting`
    )
    process.exit(1)
  }

  // Check for same block number
  if (latestBlockCluster1.number !== latestBlockCluster2.number) {
    console.log(
      `📍Block number mismatch from clusters. Cluster 1: ${Number(
        latestBlockCluster1.number
      )}, Cluster 2: ${Number(latestBlockCluster2.number)}, exiting`
    )
    process.exit(1)
  }

  // Check for same hash
  if (latestBlockCluster1.hash !== latestBlockCluster2.hash) {
    console.log(
      `📍Block hash mismatch, failed reorg. Cluster 1: ${latestBlockCluster1.hash}, Cluster 2: ${latestBlockCluster2.hash}, exiting`
    )
    process.exit(1)
  }

  console.log(
    `📍Same block found on both clusters. Block number: ${Number(
      latestBlockCluster1.number
    )}, Cluster 1 hash: ${latestBlockCluster1.hash}, Cluster 2 hash: ${
      latestBlockCluster2.hash
    }`
  )
}

export async function validateReorg(host1, expectedBlock) {
  let count = 0
  while (1) {
    await timer(2000)
    console.log(
      `📍Attempting to fetch block ${Number(
        expectedBlock.number
      )} from cluster 1, count: ${count}`
    )
    count++

    const latestBlockCluster1 = await runCommand(
      getBlock,
      host1,
      expectedBlock.number,
      maxRetries
    )
    if (
      latestBlockCluster1 === undefined ||
      latestBlockCluster1.number === undefined
    ) {
      console.log(
        `📍Unable to fetch block ${Number(
          latestBlockCluster1.number
        )} in cluster 1, exiting`
      )
      continue
      // process.exit(1)
    }

    if (latestBlockCluster1.hash !== expectedBlock.hash) {
      console.log(
        `📍Hash mismatch among clusters. Cluster 1 hash: ${latestBlockCluster1.hash}, Cluster 2 hash: ${expectedBlock.hash}, exiting`
      )
      continue
      // process.exit(1)
    }

    // If reached here, exit
    return
  }
}
