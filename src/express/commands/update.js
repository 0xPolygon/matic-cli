import {
  checkAndReturnVMIndex,
  loadDevnetConfig,
  returnTotalBorNodes,
  splitToArray
} from '../common/config-utils.js'

import { runSshCommand, maxRetries } from '../common/remote-worker.js'
import dotenv from 'dotenv'

export async function pullAndRestartBor(ip, i, isPull) {
  console.log('📍Working on bor for machine ' + ip + '...')

  const borRepo = process.env.BOR_REPO
  const borBranch = process.env.BOR_BRANCH

  console.log('📍Stopping bor...')
  let command =
    'sudo systemctl stop bor.service || echo "bor not running on current machine..."'
  await runSshCommand(ip, command, maxRetries)

  if (isPull) {
    if (i === 0 && parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) > 0) {
      console.log(
        '📍Pulling bor latest changes for branch ' + borBranch + ' ...'
      )
      command = `cd ~/matic-cli/devnet/code/bor && git fetch && git checkout ${borBranch} && git pull origin ${borBranch} `
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Installing bor...')
      command = 'cd ~/matic-cli/devnet/code/bor && make bor'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new bor binary...')
      command =
        'sudo cp ~/matic-cli/devnet/code/bor/build/bin/bor /usr/bin/ || echo "new bor binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new heimdall binary...')
      command =
        'sudo cp ~/matic-cli/devnet/code/bor/build/bin/bor ~/go/bin/ || echo "new bor binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)
    } else {
      console.log('📍Cloning bor repo...')
      command = `cd ~ && git clone ${borRepo} || (cd ~/bor; git fetch)`
      await runSshCommand(ip, command, maxRetries)

      console.log(
        '📍Pulling bor latest changes for branch ' + borBranch + ' ...'
      )
      command = `cd ~/bor && git fetch && git checkout ${borBranch} && git pull origin ${borBranch} `
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Installing bor...')
      command = 'cd ~/bor && make bor'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new bor binary...')
      command =
        'sudo cp ~/bor/build/bin/bor /usr/bin/ || echo "new bor binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new heimdall binary...')
      command =
        'sudo cp ~/bor/build/bin/bor ~/go/bin/ || echo "new bor binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)
    }
  }

  console.log('📍Starting bor...')
  command =
    'sudo systemctl start bor.service || echo "bor not configured on current machine..."'
  await runSshCommand(ip, command, maxRetries)
}

export async function pullAndRestartErigon(ip, i, isPull, erigonHostsLength) {
  console.log('📍Working on erigon for machine ' + ip + '...')

  const erigonRepo = process.env.ERIGON_REPO
  const erigonBranch = process.env.ERIGON_BRANCH

  console.log('📍Stopping erigon...')
  let command =
    'sudo systemctl stop erigon.service || echo "erigon not running on current machine..."'
  await runSshCommand(ip, command, maxRetries)

  if (isPull) {
    if (
      (i === 0 || i - erigonHostsLength === 0) &&
      parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) === 0
    ) {
      console.log(
        '📍Pulling erigon latest changes for branch ' + erigonBranch + ' ...'
      )
      command = `cd ~/matic-cli/devnet/code/erigon && git fetch && git checkout ${erigonBranch} && git pull origin ${erigonBranch} `
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Installing erigon...')
      command = 'cd ~/matic-cli/devnet/code/erigon && make erigon'
      await runSshCommand(ip, command, maxRetries)
    } else {
      console.log('📍Cloning erigon repo...')
      command = `cd ~ && git clone ${erigonRepo} || (cd ~/erigon; git fetch)`
      await runSshCommand(ip, command, maxRetries)

      console.log(
        '📍Pulling erigon latest changes for branch ' + erigonBranch + ' ...'
      )
      command = `cd ~/erigon && git fetch && git checkout ${erigonBranch} && git pull origin ${erigonBranch} `
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Installing erigon...')
      command = 'cd ~/erigon && make erigon'
      await runSshCommand(ip, command, maxRetries)
    }
  }

  console.log('📍Starting erigon...')
  command =
    'sudo systemctl start erigon.service || echo "erigon not configured on current machine..."'
  await runSshCommand(ip, command, maxRetries)
}

export async function pullAndRestartHeimdall(doc, ip, i, isPull) {
  console.log('📍Working on heimdall for machine ' + ip + '...')

  const heimdallRepo = process.env.HEIMDALL_REPO
  const heimdallBranch = process.env.HEIMDALL_BRANCH

  console.log('📍Stopping heimdall...')
  let command =
    'sudo systemctl stop heimdalld.service || echo "heimdall not running on current machine..."'
  await runSshCommand(ip, command, maxRetries)

  if (isPull) {
    if (
      (i === 0 && doc.numOfBorValidators > 0) ||
      (doc.numOfBorValidators === 0 && i === returnTotalBorNodes(doc))
    ) {
      console.log(
        '📍Pulling heimdall latest changes for branch ' +
          heimdallBranch +
          ' ...'
      )
      command = `cd ~/matic-cli/devnet/code/heimdall-v2 && git fetch && git checkout ${heimdallBranch} && git pull origin ${heimdallBranch} `
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Installing heimdall...')
      command = 'cd ~/matic-cli/devnet/code/heimdall-v2 && make build'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new heimdall binary...')
      command =
        'sudo cp ~/matic-cli/devnet/code/heimdall-v2/build/heimdalld /usr/bin/ || echo "new heimdalld binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new heimdall binary...')
      command =
        'sudo cp ~/matic-cli/devnet/code/heimdall-v2/build/heimdalld ~/go/bin/ || echo "new heimdalld binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)
    } else {
      console.log('📍Cloning heimdall repo...')
      command = `cd ~ && git clone ${heimdallRepo} || (cd ~/heimdall-v2; git fetch)`
      await runSshCommand(ip, command, maxRetries)

      console.log(
        '📍Pulling heimdall latest changes for branch ' +
          heimdallBranch +
          ' ...'
      )
      command = `cd ~/heimdall-v2 && git fetch && git checkout ${heimdallBranch} && git pull origin ${heimdallBranch} `
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Installing heimdall...')
      command = 'cd ~/heimdall-v2 && make build'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new heimdall binary...')
      command =
        'sudo cp ~/heimdall-v2/build/heimdalld /usr/bin/ || echo "new heimdalld binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)

      console.log('📍Moving new heimdall binary...')
      command =
        'sudo cp ~/heimdall-v2/build/heimdalld ~/go/bin/ || echo "new heimdalld binary could not be copied"'
      await runSshCommand(ip, command, maxRetries)
    }
  }

  console.log('📍Starting heimdall...')
  command =
    'sudo systemctl start heimdalld.service || echo "heimdall not configured on current machine..."'
  await runSshCommand(ip, command, maxRetries)
}

export async function updateAll(n) {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const doc = await loadDevnetConfig('remote')
  const vmIndex = await checkAndReturnVMIndex(n, doc)
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

  const hostToIndexMap = new Map()
  let ip

  if (vmIndex === undefined) {
    for (let i = 0; i < totalHosts.length; i++) {
      ip = `${totalUsers[i]}@${totalHosts[i]}`
      nodeIps.push(ip)
      hostToIndexMap.set(ip, i)
    }

    const updateAllTasks = nodeIps.map(async (ip) => {
      if (hostToIndexMap.get(ip) < returnTotalBorNodes(doc)) {
        await pullAndRestartBor(ip, hostToIndexMap.get(ip), true)
      } else {
        await pullAndRestartErigon(
          ip,
          hostToIndexMap.get(ip),
          true,
          doc.devnetErigonHosts.length
        )
      }
      await pullAndRestartHeimdall(doc, ip, hostToIndexMap.get(ip), true)
    })

    await Promise.all(updateAllTasks)
  } else {
    ip = `${totalUsers[vmIndex]}@${totalHosts[vmIndex]}`

    if (vmIndex < returnTotalBorNodes(doc)) {
      await pullAndRestartBor(ip, vmIndex, true)
    } else {
      await pullAndRestartErigon(
        ip,
        vmIndex,
        true,
        doc.devnetErigonHosts.length
      )
    }
    await pullAndRestartHeimdall(doc, ip, vmIndex, true)
  }
}

export async function updateBor(n) {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const doc = await loadDevnetConfig('remote')
  const vmIndex = await checkAndReturnVMIndex(n, doc)
  const borUsers = splitToArray(doc.devnetBorUsers.toString())
  const nodeIps = []
  const hostToIndexMap = new Map()
  let ip

  if (vmIndex === undefined) {
    for (let i = 0; i < doc.devnetBorHosts.length; i++) {
      ip = `${borUsers[i]}@${doc.devnetBorHosts[i]}`
      nodeIps.push(ip)
      hostToIndexMap.set(ip, i)
    }

    const updateBorTasks = nodeIps.map(async (ip) => {
      await pullAndRestartBor(ip, hostToIndexMap.get(ip), true)
    })

    await Promise.all(updateBorTasks)
  } else {
    if (vmIndex >= doc.devnetBorHosts.length) {
      console.log('📍Wrong VM index, please check your configs! Exiting...')
      process.exit(1)
    }
    ip = `${borUsers[vmIndex]}@${doc.devnetBorHosts[vmIndex]}`
    await pullAndRestartBor(ip, vmIndex, true)
  }
}

export async function updateErigon(n) {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const doc = await loadDevnetConfig('remote')
  const vmIndex = await checkAndReturnVMIndex(n, doc)
  const erigonUsers = splitToArray(doc.devnetErigonUsers.toString())
  const nodeIps = []
  const hostToIndexMap = new Map()
  let ip

  if (vmIndex === undefined) {
    for (let i = 0; i < doc.devnetErigonHosts.length; i++) {
      ip = `${erigonUsers[i]}@${doc.devnetErigonHosts[i]}`
      nodeIps.push(ip)
      hostToIndexMap.set(ip, i)
    }

    const updateErigonTasks = nodeIps.map(async (ip) => {
      await pullAndRestartErigon(
        ip,
        hostToIndexMap.get(ip),
        true,
        doc.devnetErigonHosts.length
      )
    })

    await Promise.all(updateErigonTasks)
  } else {
    if (vmIndex < returnTotalBorNodes(doc)) {
      console.log('📍Wrong VM index, please check your configs! Exiting...')
      process.exit(1)
    }
    ip = `${doc.devnetErigonUsers[vmIndex - returnTotalBorNodes(doc)]}@${
      doc.devnetErigonHosts[vmIndex - returnTotalBorNodes(doc)]
    }`
    await pullAndRestartErigon(ip, vmIndex, true, doc.devnetErigonHosts.length)
  }
}

export async function updateHeimdall(n) {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const doc = await loadDevnetConfig('remote')
  const vmIndex = await checkAndReturnVMIndex(n, doc)
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

  const hostToIndexMap = new Map()
  let ip

  if (vmIndex === undefined) {
    for (let i = 0; i < totalHosts.length; i++) {
      ip = `${totalUsers[i]}@${totalHosts[i]}`
      nodeIps.push(ip)
      hostToIndexMap.set(ip, i)
    }

    const updateHeimdallTasks = nodeIps.map(async (ip) => {
      await pullAndRestartHeimdall(doc, ip, hostToIndexMap.get(ip), true)
    })

    await Promise.all(updateHeimdallTasks)
  } else {
    ip = `${totalUsers[vmIndex]}@${totalHosts[vmIndex]}`
    await pullAndRestartHeimdall(doc, ip, vmIndex, true)
  }
}
