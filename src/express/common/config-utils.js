// noinspection JSCheckFunctionSignatures, JSUnresolvedFunction

import yaml from 'js-yaml'
import fs from 'fs'
import { cleanEnv, num, bool, url, host, makeValidator } from 'envalid'
import { constants } from './constants.js'
import shell from 'shelljs'

const validStr = makeValidator((x) => {
  if (x !== undefined && x !== null && x !== '') return x
  else throw new Error(x + 'is not valid, please check your configs!')
})

const validBorChainId = makeValidator((x) => {
  if (x !== undefined && x !== null && (x.match(/^$/g) || x > 0)) return x
  else throw new Error(x + 'is not valid, please check your configs!')
})

const validHeimdallChainId = makeValidator((x) => {
  if (
    x !== undefined &&
    x !== null &&
    (x.match(/^$|heimdall-\d+$/g) || x > 0)
  ) {
    return x
  } else throw new Error(x + 'is not valid, please check your configs!')
})

const validAmiStr = makeValidator((x) => {
  if (x !== undefined && x !== null && x !== '' && x.startsWith('ami-')) {
    return x
  } else throw new Error(x + 'is not valid, please check your configs!')
})

const validGCPVmImageStr = makeValidator((x) => {
  if (x !== undefined && x !== null && x !== '' && x.startsWith('ubuntu-')) {
    return x
  } else throw new Error(x + 'is not valid, please check your configs!')
})

const validZone = makeValidator((x) => {
  if (
    x !== undefined &&
    x !== null &&
    x !== '' &&
    x.startsWith(process.env.TF_VAR_GCP_REGION + '-')
  ) {
    return x
  } else throw new Error(x + 'is not valid, please check your configs!')
})

const validCertPathStr = makeValidator((x) => {
  if (x !== undefined && x !== null && x !== '' && !x.startsWith('~')) {
    console.log('Done Checking path..')
    return x
  } else throw new Error(x + 'is not valid, please check your configs!')
})

function validateEnvVars(cloud) {
  // validating AWS infra vars
  if (cloud === constants.cloud.AWS) {
    cleanEnv(process.env, {
      TF_VAR_BOR_IOPS: num({ default: 3000 }),
      TF_VAR_ERIGON_IOPS: num({ default: 3000 }),
      TF_VAR_BOR_INSTANCE_TYPE: validStr({ default: 't2.xlarge' }),
      TF_VAR_ERIGON_INSTANCE_TYPE: validStr({ default: 't2.xlarge' }),
      TF_VAR_BOR_ARCHIVE_INSTANCE_TYPE: validStr({ default: 't2.xlarge' }),
      TF_VAR_ERIGON_ARCHIVE_INSTANCE_TYPE: validStr({ default: 't2.xlarge' }),
      TF_VAR_INSTANCE_AMI: validAmiStr({ default: 'ami-01dd271720c1ba44f' }),
      TF_VAR_PEM_FILE: validStr({ default: 'aws-key' }),
      TF_VAR_BOR_VOLUME_TYPE: validStr({ default: 'gp3' }),
      TF_VAR_ERIGON_VOLUME_TYPE: validStr({ default: 'gp3' }),
      TF_VAR_BOR_ARCHIVE_VOLUME_TYPE: validStr({ default: 'io1' }),
      TF_VAR_ERIGON_ARCHIVE_VOLUME_TYPE: validStr({ default: 'io1' }),
      TF_VAR_AWS_REGION: validStr({
        default: 'eu-west-1',
        choices: [
          'us-east-2',
          'us-east-1',
          'us-west-1',
          'us-west-2',
          'af-south-1',
          'ap-east-1',
          'ap-south-2',
          'ap-southeast-3',
          'ap-south-1',
          'ap-northeast-3',
          'ap-northeast-2',
          'ap-southeast-1',
          'ap-southeast-2',
          'ap-northeast-1',
          'ca-central-1',
          'eu-central-1',
          'eu-west-1',
          'eu-west-2',
          'eu-south-1',
          'eu-west-3',
          'eu-south-2',
          'eu-north-1',
          'eu-central-2',
          'me-south-1',
          'me-central-1',
          'sa-east-1',
          'us-gov-east-1',
          'us-gov-west-1'
        ],
        docs:
          'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/' +
          'Concepts.RegionsAndAvailabilityZones.html'
      })
    })

    // validating GCP infra vars
  } else if (cloud === constants.cloud.GCP) {
    cleanEnv(process.env, {
      TF_VAR_FW_RULE_SUFFIX: validStr({ default: 'matic' }),
      TF_VAR_BOR_MACHINE_TYPE: validStr({ default: 'n2d-standard-4' }),
      TF_VAR_ERIGON_MACHINE_TYPE: validStr({ default: 'n2d-standard-4' }),
      TF_VAR_BOR_ARCHIVE_MACHINE_TYPE: validStr({ default: 'n2d-standard-4' }),
      TF_VAR_ERIGON_ARCHIVE_MACHINE_TYPE: validStr({
        default: 'n2d-standard-4'
      }),
      TF_VAR_INSTANCE_IMAGE: validGCPVmImageStr({
        default: 'ubuntu-2204-jammy-v20230302'
      }),
      TF_VAR_BOR_VOLUME_TYPE_GCP: validStr({ default: 'pd-ssd' }),
      TF_VAR_ERIGON_VOLUME_TYPE_GCP: validStr({ default: 'pd-ssd' }),
      TF_VAR_BOR_ARCHIVE_VOLUME_TYPE_GCP: validStr({ default: 'pd-balanced' }),
      TF_VAR_ERIGON_ARCHIVE_VOLUME_TYPE_GCP: validStr({
        default: 'pd-balanced'
      }),
      TF_VAR_GCP_REGION: validStr({
        default: 'europe-west2',
        choices: [
          'asia-east1',
          'asia-east2',
          'asia-northeast1',
          'asia-northeast2',
          'asia-northeast3',
          'asia-south1',
          'asia-south2',
          'asia-southeast1',
          'asia-southeast2',
          'australia-southeast1',
          'australia-southeast2',
          'europe-central2',
          'europe-north1',
          'europe-southwest1',
          'europe-west1',
          'europe-west2',
          'europe-west3',
          'europe-west4',
          'europe-west6',
          'europe-west8',
          'europe-west9',
          'me-west1',
          'northamerica-northeast1',
          'northamerica-northeast2',
          'southamerica-east1',
          'southamerica-west1',
          'us-central1',
          'us-east1',
          'us-east4',
          'us-east5',
          'us-south1',
          'us-west1',
          'us-west2',
          'us-west3',
          'us-west4'
        ],
        docs: 'https://cloud.google.com/compute/docs/regions-zones'
      }),
      TF_VAR_ZONE: validZone({ default: 'europe-west2-a' }),
      TF_VAR_GCP_PUB_KEY_FILE: validStr({
        default: '/home/ubuntu/aws-key.pem.pub'
      })
    })
  } else {
    console.log(`❌ Unsupported cloud provider ${cloud}`)
    process.exit(1)
  }

  cleanEnv(process.env, {
    TF_VAR_VM_NAME: validStr({ default: 'polygon-user' }),
    TF_VAR_DOCKERIZED: validStr({ choices: ['yes', 'no'] }),
    TF_VAR_BOR_DISK_SIZE_GB: num({ default: 20 }),
    TF_VAR_ERIGON_DISK_SIZE_GB: num({ default: 20 }),
    TF_VAR_BOR_VALIDATOR_COUNT: num({ default: 2 }),
    TF_VAR_ERIGON_VALIDATOR_COUNT: num({ default: 0 }),
    TF_VAR_BOR_SENTRY_COUNT: num({ default: 1 }),
    TF_VAR_ERIGON_SENTRY_COUNT: num({ default: 0 }),
    TF_VAR_BOR_ARCHIVE_COUNT: num({ default: 0 }),
    TF_VAR_ERIGON_ARCHIVE_COUNT: num({ default: 0 }),
    PEM_FILE_PATH: validCertPathStr({ default: '/home/ubuntu/aws-key.pem' }),
    DEFAULT_STAKE: num({ default: 10000 }),
    DEFAULT_FEE: num({ default: 2000 }),
    BOR_CHAIN_ID: validBorChainId({ default: '15005' }),
    HEIMDALL_CHAIN_ID: validHeimdallChainId({ default: 'heimdall-4052' }),
    SPRINT_SIZE: num({ default: 64 }),
    BLOCK_NUMBER: validStr({ default: '0,64' }),
    BLOCK_TIME: validStr({ default: '3,2' }),
    DEVNET_BOR_FLAGS: validStr({ default: 'config,cli' }),
    BOR_REPO: validStr({
      default: 'https://github.com/0xPolygon/bor.git'
    }),
    BOR_BRANCH: validStr({ default: 'develop' }),
    ERIGON_REPO: validStr({
      default: 'https://github.com/erigontech/erigon.git'
    }),
    ERIGON_BRANCH: validStr({ default: 'main' }),
    HEIMDALL_REPO: validStr({
      default: 'https://github.com/0xPolygon/heimdall-v2.git'
    }),
    HEIMDALL_BRANCH: validStr({ default: 'develop' }),
    CONTRACTS_REPO: validStr({
      default: 'https://github.com/0xPolygon/pos-contracts.git'
    }),
    CONTRACTS_BRANCH: validStr({ default: 'master' }),
    GENESIS_CONTRACTS_REPO: validStr({
      default: 'https://github.com/0xPolygon/genesis-contracts.git'
    }),
    GENESIS_CONTRACTS_BRANCH: validStr({ default: 'master' }),
    MATIC_CLI_REPO: validStr({
      default: 'https://github.com/0xPolygon/matic-cli.git'
    }),
    MATIC_CLI_BRANCH: validStr({ default: 'master' }),
    INSTANCES_IDS: validStr({
      default: 'i-02a1f3a2884c9edbc,i-03b2d4b3014a4becd'
    }),
    BOR_DOCKER_BUILD_CONTEXT: url({
      default: 'https://github.com/0xPolygon/bor.git#develop'
    }),
    HEIMDALL_DOCKER_BUILD_CONTEXT: url({
      default: 'https://github.com/0xPolygon/heimdall-v2.git#develop'
    }),
    VERBOSE: bool({ default: true }),
    DD_API_KEY: validStr({ default: 'DATADOG_API_KEY' }),
    MNEMONIC: validStr({
      default:
        'clock radar mass judge dismiss just intact ' +
        'mind resemble fringe diary casino'
    }),
    SPEED: num({ default: 200 }),
    MAX_ACCOUNTS: num({ default: 100000 }),
    FUND: bool({ default: true }),
    STRESS_DEBUG_LOGS: bool({ default: true }),
    BURN_CONTRACT_ADDRESS: validStr({
      default: '0x000000000000000000000000000000000000dead'
    }),
    MAX_FEE: num({ default: 30000000009 }),
    MAX_PRIORITY_FEE: num({ default: 30000000000 }),
    COUNT: num({ default: 100 })
  })
}

function validateAwsKeyAndCertificate() {
  const certFilePath = process.env.PEM_FILE_PATH
  const certName = certFilePath
    .substring(certFilePath.lastIndexOf('/') + 1)
    .split('.')[0]
  if (certName !== process.env.TF_VAR_PEM_FILE) {
    console.log(
      '❌ PEM_FILE_PATH and TF_VAR_PEM_FILE are inconsistent, please check your configs!'
    )
    process.exit(1)
  }
}

function validateUsersAndHosts() {
  console.log(
    '📍Validating DEVNET_BOR_USERS, DEVNET_BOR_HOSTS, DEVNET_ERIGON_USERS and DEVNET_ERIGON_HOSTS...'
  )
  let borUsers, borHosts, erigonUsers, erigonHosts, borFlags
  if (process.env.DEVNET_BOR_USERS && process.env.DEVNET_BOR_HOSTS) {
    borUsers = process.env.DEVNET_BOR_USERS.split(',')
    borHosts = process.env.DEVNET_BOR_HOSTS.split(',')
  }
  if (process.env.DEVNET_ERIGON_USERS && process.env.DEVNET_ERIGON_HOSTS) {
    erigonUsers = process.env.DEVNET_ERIGON_USERS.split(',')
    erigonHosts = process.env.DEVNET_ERIGON_HOSTS.split(',')
  }
  if (process.env.DEVNET_BOR_FLAGS) {
    borFlags = process.env.DEVNET_BOR_FLAGS.split(',')
  }
  const borValCount = Number(process.env.TF_VAR_BOR_VALIDATOR_COUNT)
  const borSenCount = Number(process.env.TF_VAR_BOR_SENTRY_COUNT)
  const borArchiveCount = Number(process.env.TF_VAR_BOR_ARCHIVE_COUNT)
  const erigonValCount = Number(process.env.TF_VAR_ERIGON_VALIDATOR_COUNT)
  const erigonSenCount = Number(process.env.TF_VAR_ERIGON_SENTRY_COUNT)
  const erigonArchiveCount = Number(process.env.TF_VAR_ERIGON_ARCHIVE_COUNT)

  if (
    process.env.DEVNET_BOR_USERS &&
    process.env.DEVNET_BOR_FLAGS &&
    borFlags.length !== borUsers.length
  ) {
    console.log(
      '❌ DEVNET_BOR_USERS lengths and DEVNET_BOR_FLAGS length are not equal, please check your configs!'
    )
    process.exit(1)
  }

  if (
    process.env.TF_VAR_DOCKERIZED === 'yes' &&
    borUsers &&
    borUsers.length !== borValCount + borSenCount + borArchiveCount
  ) {
    console.log(
      '❌ DEVNET_BOR_USERS lengths are not equal to the nodes count ' +
        '(TF_VAR_BOR_VALIDATOR_COUNT+TF_VAR_BOR_SENTRY_COUNT+TF_VAR_BOR_ARCHIVE_COUNT), please check your configs!'
    )
    process.exit(1)
  } else if (process.env.TF_VAR_DOCKERIZED === 'no') {
    if (
      borUsers &&
      (borUsers.length !== borHosts.length ||
        borUsers.length !== borValCount + borSenCount + borArchiveCount ||
        borHosts.length !== borValCount + borSenCount + borArchiveCount)
    ) {
      console.log(
        '❌ DEVNET_BOR_USERS or DEVNET_BOR_HOSTS lengths are not equal to the nodes count ' +
          '(TF_VAR_BOR_VALIDATOR_COUNT+TF_VAR_BOR_SENTRY_COUNT+TF_VAR_BOR_ARCHIVE_COUNT), please check your configs!'
      )
      process.exit(1)
    }

    if (
      erigonUsers &&
      (erigonUsers.length !== erigonHosts.length ||
        erigonUsers.length !==
          erigonValCount + erigonSenCount + erigonArchiveCount ||
        erigonHosts.length !==
          erigonValCount + erigonSenCount + erigonArchiveCount)
    ) {
      console.log(
        '❌ DEVNET_ERIGON_USERS or DEVNET_ERIGON_HOSTS lengths are not equal to the nodes count ' +
          '(TF_VAR_ERIGON_VALIDATOR_COUNT+TF_VAR_ERIGON_SENTRY_COUNT+TF_VAR_ERIGON_ARCHIVE_COUNT), please check your configs!'
      )
      process.exit(1)
    }
  }

  if (borUsers) {
    borUsers.forEach((user) => {
      if (user !== 'ubuntu') {
        console.log(
          "❌ DEVNET_BOR_USERS must all be named 'ubuntu', please check your configs!"
        )
        process.exit(1)
      }
    })
    borHosts.forEach((borHost) => {
      host(borHost)
    })
  }
  if (borFlags) {
    borFlags.forEach((flag) => {
      if (flag !== 'config' && flag !== 'cli') {
        console.log(
          "❌ DEVNET_BOR_FLAGS must all be 'config' or 'cli', please check your configs!"
        )
        process.exit(1)
      }
    })
  }
  if (erigonUsers) {
    erigonUsers.forEach((user) => {
      if (user !== 'ubuntu') {
        console.log(
          "❌ DEVNET_ERIGON_USERS must all be named 'ubuntu', please check your configs!"
        )
        process.exit(1)
      }
    })
    erigonHosts.forEach((erigonHost) => {
      host(erigonHost)
    })
  }
}

function validateBlockParams() {
  console.log(
    '📍Validating genesis specific values BLOCK_NUMBER and BLOCK_TIME...'
  )
  const blockNumbers = process.env.BLOCK_NUMBER.split(',')
  const blockTimes = process.env.BLOCK_TIME.split(',')
  if (blockNumbers.length !== blockTimes.length) {
    console.log(
      '❌ BLOCK_NUMBER and BLOCK_TIME have different lengths, please check your configs!'
    )
    process.exit(1)
  }
}

function validateGitConfigs() {
  console.log('📍Validating git configs for all repos...')
  console.log('📍Validating bor...')
  shell.exec(
    `git ls-remote --exit-code --heads --tags ${process.env.BOR_REPO} ${process.env.BOR_BRANCH} ||
    git fetch ${process.env.BOR_REPO} ${process.env.BOR_BRANCH}`
  )
  if (shell.error() != null) {
    console.log(
      '❌ Error while test-cloning bor repo, please check your configs!'
    )
    process.exit(1)
  }
  console.log('📍Validating heimdall...')
  shell.exec(
    `git ls-remote --exit-code --heads --tags ${process.env.HEIMDALL_REPO} ${process.env.HEIMDALL_BRANCH} ||
    git fetch ${process.env.HEIMDALL_REPO} ${process.env.HEIMDALL_BRANCH}`
  )
  if (shell.error() != null) {
    console.log(
      '❌ Error while test-cloning heimdall repo, please check your configs!'
    )
    process.exit(1)
  }

  if (process.env.ERIGON_REPO && process.env.ERIGON_BRANCH) {
    console.log('📍Validating Erigon...')
    shell.exec(
      `git ls-remote --exit-code --heads --tags ${process.env.ERIGON_REPO} ${process.env.ERIGON_BRANCH} ||
      git fetch ${process.env.ERIGON_REPO} ${process.env.ERIGON_BRANCH}`
    )
    if (shell.error() != null) {
      console.log(
        '❌ Error while test-cloning Erigon repo, please check your configs!'
      )
      process.exit(1)
    }
  }

  console.log('📍Validating matic-cli...')
  shell.exec(
    `git ls-remote --exit-code --heads --tags ${process.env.MATIC_CLI_REPO} ${process.env.MATIC_CLI_BRANCH} ||
    git fetch ${process.env.MATIC_CLI_REPO} ${process.env.MATIC_CLI_BRANCH}`
  )
  if (shell.error() != null) {
    console.log(
      '❌ Error while test-cloning matic-cli repo, please check your configs!'
    )
    process.exit(1)
  }
  console.log('📍Validating contracts...')
  shell.exec(
    `git ls-remote --exit-code --heads --tags ${process.env.CONTRACTS_REPO} ${process.env.CONTRACTS_BRANCH} ||
    git fetch ${process.env.CONTRACTS_REPO} ${process.env.CONTRACTS_BRANCH}`
  )
  if (shell.error() != null) {
    console.log(
      '❌ Error while test-cloning contracts repo, please check your configs!'
    )
    process.exit(1)
  }
  console.log('📍Validating genesis-contracts...')
  shell.exec(
    `git ls-remote --exit-code --heads --tags ${process.env.GENESIS_CONTRACTS_REPO} ${process.env.GENESIS_CONTRACTS_BRANCH} ||
    git fetch ${process.env.GENESIS_CONTRACTS_REPO} ${process.env.GENESIS_CONTRACTS_BRANCH}`
  )
  if (shell.error() != null) {
    console.log(
      '❌ Error while cloning genesis-contracts repo, please check your configs!'
    )
    process.exit(1)
  }
}

function setCommonConfigs(doc) {
  setConfigValue('defaultStake', parseInt(process.env.DEFAULT_STAKE), doc)
  setConfigValue('defaultFee', parseInt(process.env.DEFAULT_FEE), doc)

  let borChainId, heimdallChainId

  if (process.env.NETWORK) {
    setConfigValue('network', process.env.NETWORK, doc)
    if (process.env.NETWORK === 'mainnet') {
      borChainId = 137
      heimdallChainId = 'heimdallv2-137'
    } else if (process.env.NETWORK === 'mumbai') {
      borChainId = 80001
      heimdallChainId = 'heimdallv2-80001'
    } else if (process.env.NETWORK === 'amoy') {
      borChainId = 80002
      heimdallChainId = 'heimdallv2-80002'
    }
  } else if (!process.env.BOR_CHAIN_ID && !process.env.HEIMDALL_CHAIN_ID) {
    borChainId = Math.floor(Math.random() * 10000 + 1000)
    heimdallChainId = 'heimdall-' + borChainId
  } else if (!process.env.BOR_CHAIN_ID) {
    try {
      if (process.env.HEIMDALL_CHAIN_ID > 0) {
        borChainId = process.env.HEIMDALL_CHAIN_ID
        heimdallChainId = 'heimdall-' + process.env.HEIMDALL_CHAIN_ID
      } else {
        borChainId = process.env.HEIMDALL_CHAIN_ID.split('-')[1]
      }
    } catch (error) {
      console.log(
        '❌ Error occurred while processing heimdall chain id (Heimdall chain id should be like: heimdall-4052)!'
      )
      process.exit(1)
    }
  } else if (!process.env.HEIMDALL_CHAIN_ID) {
    borChainId = process.env.BOR_CHAIN_ID
    heimdallChainId = 'heimdall-' + borChainId
  } else {
    borChainId = process.env.BOR_CHAIN_ID
    if (process.env.HEIMDALL_CHAIN_ID > 0) {
      heimdallChainId = 'heimdall-' + process.env.HEIMDALL_CHAIN_ID
    } else {
      heimdallChainId = process.env.HEIMDALL_CHAIN_ID
    }
  }

  setConfigValue('borChainId', borChainId, doc)
  setConfigValue('mnemonic', process.env.MNEMONIC, doc)
  setConfigValue('heimdallChainId', heimdallChainId, doc)
  setConfigList('sprintSize', process.env.SPRINT_SIZE, doc)
  setConfigList(
    'sprintSizeBlockNumber',
    process.env.SPRINT_SIZE_BLOCK_NUMBER,
    doc
  )
  setConfigList('blockNumber', process.env.BLOCK_NUMBER, doc)
  setConfigList('blockTime', process.env.BLOCK_TIME, doc)
  setConfigValue('borRepo', process.env.BOR_REPO, doc)
  setConfigValue('borBranch', process.env.BOR_BRANCH, doc)
  if (process.env.ERIGON_REPO) {
    setConfigValue('erigonRepo', process.env.ERIGON_REPO, doc)
  }
  if (process.env.ERIGON_BRANCH) {
    setConfigValue('erigonBranch', process.env.ERIGON_BRANCH, doc)
  }
  setConfigValue('heimdallRepo', process.env.HEIMDALL_REPO, doc)
  setConfigValue('heimdallBranch', process.env.HEIMDALL_BRANCH, doc)
  setConfigList('heimdallSeeds', process.env.HEIMDALL_SEEDS, doc)
  setConfigValue('contractsRepo', process.env.CONTRACTS_REPO, doc)
  setConfigValue('contractsBranch', process.env.CONTRACTS_BRANCH, doc)
  setConfigValue(
    'genesisContractsRepo',
    process.env.GENESIS_CONTRACTS_REPO,
    doc
  )
  setConfigValue(
    'genesisContractsBranch',
    process.env.GENESIS_CONTRACTS_BRANCH,
    doc
  )
  setConfigValue(
    'numOfBorValidators',
    parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT),
    doc
  )
  setConfigValue(
    'numOfBorSentries',
    parseInt(process.env.TF_VAR_BOR_SENTRY_COUNT),
    doc
  )
  setConfigValue(
    'numOfBorArchiveNodes',
    parseInt(process.env.TF_VAR_BOR_ARCHIVE_COUNT),
    doc
  )
  setConfigValue(
    'numOfErigonValidators',
    parseInt(process.env.TF_VAR_ERIGON_VALIDATOR_COUNT),
    doc
  )
  setConfigValue(
    'numOfErigonSentries',
    parseInt(process.env.TF_VAR_ERIGON_SENTRY_COUNT),
    doc
  )
  setConfigValue(
    'numOfErigonArchiveNodes',
    parseInt(process.env.TF_VAR_ERIGON_ARCHIVE_COUNT),
    doc
  )
  setConfigValue('ethHostUser', process.env.ETH_HOST_USER, doc)
  setConfigValue(
    'borDockerBuildContext',
    process.env.BOR_DOCKER_BUILD_CONTEXT,
    doc
  )
  setConfigValue(
    'heimdallDockerBuildContext',
    process.env.HEIMDALL_DOCKER_BUILD_CONTEXT,
    doc
  )
  setConfigList('instancesIds', process.env.INSTANCES_IDS, doc)
  setConfigValue('snapshot', process.env.SNAPSHOT, doc)

  if (!process.env.DEVNET_BOR_USERS) {
    setConfigList('devnetErigonHosts', process.env.DEVNET_ERIGON_HOSTS, doc)
    setConfigList('devnetErigonUsers', process.env.DEVNET_ERIGON_USERS, doc)
    setConfigList('devnetHeimdallUsers', process.env.DEVNET_ERIGON_USERS, doc)
    setConfigList('devnetHeimdallHosts', process.env.DEVNET_ERIGON_HOSTS, doc)
    deleteConfig('devnetBorUsers', doc)
    deleteConfig('devnetBorHosts', doc)
    deleteConfig('devnetBorFlags', doc)
  } else if (!process.env.DEVNET_ERIGON_USERS) {
    setConfigList('devnetBorHosts', process.env.DEVNET_BOR_HOSTS, doc)
    setConfigList('devnetBorUsers', process.env.DEVNET_BOR_USERS, doc)
    setConfigList('devnetBorFlags', process.env.DEVNET_BOR_FLAGS, doc)
    setConfigList('devnetHeimdallUsers', process.env.DEVNET_BOR_USERS, doc)
    setConfigList('devnetHeimdallHosts', process.env.DEVNET_BOR_HOSTS, doc)
    deleteConfig('devnetErigonUsers', doc)
    deleteConfig('devnetErigonHosts', doc)
  } else {
    setConfigList('devnetBorHosts', process.env.DEVNET_BOR_HOSTS, doc)
    setConfigList('devnetBorUsers', process.env.DEVNET_BOR_USERS, doc)
    setConfigList('devnetBorFlags', process.env.DEVNET_BOR_FLAGS, doc)
    setConfigList('devnetErigonHosts', process.env.DEVNET_ERIGON_HOSTS, doc)
    setConfigList('devnetErigonUsers', process.env.DEVNET_ERIGON_USERS, doc)
    setConfigList(
      'devnetHeimdallUsers',
      process.env.DEVNET_BOR_USERS.concat(',', process.env.DEVNET_ERIGON_USERS),
      doc
    )

    const heimdallHosts = []
    heimdallHosts.push(
      ...doc.devnetBorHosts.slice(0, process.env.TF_VAR_BOR_VALIDATOR_COUNT)
    )
    heimdallHosts.push(
      ...doc.devnetErigonHosts.slice(
        0,
        process.env.TF_VAR_ERIGON_VALIDATOR_COUNT
      )
    )
    heimdallHosts.push(
      ...doc.devnetBorHosts.slice(
        process.env.TF_VAR_BOR_VALIDATOR_COUNT,
        doc.devnetBorHosts.length
      )
    )
    heimdallHosts.push(
      ...doc.devnetErigonHosts.slice(
        process.env.TF_VAR_ERIGON_VALIDATOR_COUNT,
        doc.devnetErigonHosts.length
      )
    )
    setConfigList('devnetHeimdallHosts', heimdallHosts.join(','), doc)
  }
}

function setConfigValue(key, value, doc) {
  if (value !== undefined) {
    doc[key] = value
  }
}

function setConfigList(key, value, doc) {
  if (value !== undefined) {
    value = value.split(' ').join('')
    const valueArray = value.split(',')
    if (valueArray.length > 0) {
      doc[key] = []
      for (let i = 0; i < valueArray.length; i++) {
        doc[key][i] = valueArray[i]

        if (i === 0) {
          if (key === 'devnetBorHosts') {
            if (valueArray[i]) {
              setEthURL(valueArray[i], doc)
            }
          }
          if (key === 'devnetBorUsers') {
            if (valueArray[i]) {
              setEthHostUser(valueArray[i], doc)
            }
          }
          if (key === 'devnetErigonHosts' && doc.numOfBorValidators === 0) {
            if (valueArray[i]) {
              setEthURL(valueArray[i], doc)
            }
          }
          if (key === 'devnetErigonUsers' && doc.numOfBorValidators === 0) {
            if (valueArray[i]) {
              setEthHostUser(valueArray[i], doc)
            }
          }
        }
      }
    }
  }
}

function deleteConfig(key, doc) {
  delete doc[key]
}

function setEthURL(value, doc) {
  if (value !== undefined) {
    doc.ethURL = 'http://' + value + ':9545'
    process.env.ETH_URL = doc.ethURL
  }
}

function setEthHostUser(value, doc) {
  if (value !== undefined) {
    doc.ethHostUser = value
  }
}

export function splitToArray(value) {
  try {
    return value.split(' ').join('').split(',')
  } catch (error) {
    console.error('📍Failed to split to IP array: ', error)
    console.log('📍Exiting...')
    process.exit(1)
  }
}

export function splitAndGetHostIp(value) {
  try {
    return value.split('@')[0]
  } catch (error) {
    console.error('📍Failed to split IP: ', error)
    console.log('📍Exiting...')
    process.exit(1)
  }
}

export async function checkAndReturnVMIndex(n, doc) {
  if (typeof n === 'boolean') {
    console.log('📍Targeting all VMs ...')
    return undefined
  }
  const totalHosts = []
  if (doc.devnetBorHosts) {
    totalHosts.push(...splitToArray(doc.devnetBorHosts.toString()))
  }
  if (doc.devnetErigonHosts) {
    totalHosts.push(...splitToArray(doc.devnetErigonHosts.toString()))
  }
  if (typeof n === 'string') {
    const vmIndex = parseInt(n, 10)
    if (vmIndex >= 0 && vmIndex < totalHosts.length) {
      console.log(`📍Targeting VM with IP ${totalHosts[vmIndex]} ...`)
      return vmIndex
    } else {
      console.log('📍Wrong VM index, please check your configs! Exiting...')
      process.exit(1)
    }
  }
}

export function getDevnetId() {
  const devnetFolders = process.cwd().split('/')
  const ids = devnetFolders[devnetFolders.length - 1].split('-')
  return ids[1]
}

export async function loadDevnetConfig(devnetType) {
  return yaml.load(
    fs.readFileSync(`./${devnetType}-setup-config.yaml`, 'utf-8')
  )
}

export async function editMaticCliRemoteYAMLConfig() {
  console.log('📍Editing matic-cli remote YAML configs...')

  const doc = await yaml.load(
    fs.readFileSync(`${process.cwd()}/remote-setup-config.yaml`, 'utf8'),
    undefined
  )

  setCommonConfigs(doc)
  setConfigValue('devnetType', 'remote', doc)
  if (process.env.CLOUD === constants.cloud.AWS) {
    setConfigValue('devnetRegion', process.env.TF_VAR_AWS_REGION, doc)
  } else if (process.env.CLOUD === constants.cloud.GCP) {
    setConfigValue('devnetRegion', process.env.TF_VAR_GCP_REGION, doc)
  } else {
    console.log(`❌ Unsupported cloud provider ${process.env.CLOUD}`)
    process.exit(1)
  }
  setConfigValue('cloud', process.env.CLOUD, doc)

  fs.writeFile(
    `${process.cwd()}/remote-setup-config.yaml`,
    yaml.dump(doc),
    (err) => {
      if (err) {
        console.log('❌ Error while writing remote YAML configs: \n', err)
        process.exit(1)
      }
    }
  )
}

export function setBorAndErigonHosts(dnsIps) {
  const dnsIpsArray = splitToArray(dnsIps)
  const startIndex =
    parseInt(process.env.TF_VAR_BOR_SENTRY_COUNT) +
    parseInt(process.env.TF_VAR_BOR_ARCHIVE_COUNT)
  const endIndex =
    startIndex + parseInt(process.env.TF_VAR_ERIGON_VALIDATOR_COUNT)

  let borUserArray, erigonUserArray, borHosts, erigonHosts
  if (parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) === 0) {
    const subarray = dnsIpsArray.splice(startIndex, endIndex - startIndex)
    dnsIpsArray.unshift(...subarray)
    dnsIps = dnsIpsArray.join(',')
  }
  if (process.env.DEVNET_BOR_USERS) {
    borUserArray = splitToArray(process.env.DEVNET_BOR_USERS)
    borHosts = dnsIpsArray.slice(0, borUserArray.length)
    if (parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) === 0) {
      borHosts = dnsIpsArray.slice(
        process.env.TF_VAR_ERIGON_VALIDATOR_COUNT,
        endIndex
      )
    }
  }
  if (process.env.DEVNET_ERIGON_USERS) {
    erigonUserArray = splitToArray(process.env.DEVNET_ERIGON_USERS)
    if (!process.env.DEVNET_BOR_USERS) {
      erigonHosts = dnsIpsArray.slice(0, erigonUserArray.length)
    } else if (parseInt(process.env.TF_VAR_BOR_VALIDATOR_COUNT) === 0) {
      erigonHosts = dnsIpsArray.slice(
        0,
        process.env.TF_VAR_ERIGON_VALIDATOR_COUNT
      )
      erigonHosts.push(...dnsIpsArray.slice(endIndex))
    } else {
      erigonHosts = dnsIpsArray.slice(borUserArray.length)
    }
  }
  if (borHosts) {
    process.env.DEVNET_BOR_HOSTS = borHosts
  }
  if (erigonHosts) {
    process.env.DEVNET_ERIGON_HOSTS = erigonHosts
  }

  return dnsIps
}

export function returnTotalBorNodes(doc) {
  return (
    doc.numOfBorValidators + doc.numOfBorSentries + doc.numOfBorArchiveNodes
  )
}

export async function editMaticCliDockerYAMLConfig() {
  console.log('📍Editing matic-cli docker YAML configs...')

  const doc = await yaml.load(
    fs.readFileSync(`${process.cwd()}/docker-setup-config.yaml`, 'utf8'),
    undefined
  )

  setCommonConfigs(doc)
  setEthHostUser('ubuntu', doc)
  setConfigValue('devnetType', 'docker', doc)
  setEthURL('anvil', doc)

  fs.writeFile(
    `${process.cwd()}/docker-setup-config.yaml`,
    yaml.dump(doc),
    (err) => {
      if (err) {
        console.log('❌ Error while writing docker YAML configs: \n', err)
        process.exit(1)
      }
    }
  )
}

export async function validateConfigs(cloud) {
  validateEnvVars(cloud)
  if (cloud === constants.cloud.AWS) {
    validateAwsKeyAndCertificate()
  }
  validateUsersAndHosts()
  validateBlockParams()
  validateGitConfigs()
}
