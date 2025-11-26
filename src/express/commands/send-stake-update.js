import { loadDevnetConfig } from '../common/config-utils.js'
import Web3 from 'web3'
import { timer } from '../common/time-utils.js'
import { getSignedTx } from '../common/tx-utils.js'
import { isValidatorIdCorrect } from '../common/validators-utils.js'

import {
  runScpCommand,
  runSshCommand,
  runSshCommandWithReturn,
  maxRetries
} from '../common/remote-worker.js'

import dotenv from 'dotenv'
import fs from 'fs-extra'

const ERC20ABI = await import('../../abi/ERC20ABI.json', {
  assert: { type: 'json' }
}).then((module) => module.default)

export async function sendStakeUpdateEvent(validatorID) {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const devnetType =
    process.env.TF_VAR_DOCKERIZED === 'yes' ? 'docker' : 'remote'

  const doc = await loadDevnetConfig(devnetType)
  let machine0

  if (
    !isValidatorIdCorrect(
      validatorID,
      doc.numOfBorValidators + doc.numOfErigonValidators
    )
  ) {
    console.log(
      '📍Invalid validatorID used, please try with a valid argument! Exiting...'
    )
    process.exit(1)
  }
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

  validatorID = Number(validatorID)
  const rootChainWeb3 = new Web3(`http://${machine0}:9545`)

  let src = `${doc.ethHostUser}@${machine0}:~/matic-cli/devnet/devnet/signer-dump.json`
  let dest = './signer-dump.json'
  await runScpCommand(src, dest, maxRetries)

  src = `${doc.ethHostUser}@${machine0}:~/matic-cli/devnet/code/pos-contracts/contractAddresses.json`
  dest = './contractAddresses.json'
  await runScpCommand(src, dest, maxRetries)

  const contractAddresses = JSON.parse(
    fs.readFileSync(`${process.cwd()}/contractAddresses.json`, 'utf8')
  )

  const StakeManagerProxyAddress = contractAddresses.root.StakeManagerProxy

  const MaticTokenAddr = contractAddresses.root.tokens.MaticToken
  const MaticTokenContract = new rootChainWeb3.eth.Contract(
    ERC20ABI,
    MaticTokenAddr
  )

  const signerDump = JSON.parse(
    fs.readFileSync(`${process.cwd()}/signer-dump.json`, 'utf8')
  )
  const pkey = signerDump[validatorID - 1].priv_key
  const validatorAccount = signerDump[validatorID - 1].address
  const tx = MaticTokenContract.methods.approve(
    StakeManagerProxyAddress,
    rootChainWeb3.utils.toWei('1000')
  )
  const signedTx = await getSignedTx(
    rootChainWeb3,
    MaticTokenAddr,
    tx,
    validatorAccount,
    pkey
  )
  const approvalReceipt = await rootChainWeb3.eth.sendSignedTransaction(
    signedTx.rawTransaction
  )
  console.log(
    '\n\nApproval Receipt txHash:  ' + approvalReceipt.transactionHash
  )

  const oldValidatorPower = await getValidatorPower(doc, machine0, validatorID)
  console.log('Old Validator Power:  ' + oldValidatorPower)

  // Adding 100 MATIC stake
  let command = `export PATH="$HOME/.foundry/bin:$PATH" && cast send ${MaticTokenAddr} "transfer(address,uint256)" ${validatorAccount} 100000000000000000000 --rpc-url http://localhost:9545 --private-key ${signerDump[0].priv_key}`
  await runSshCommand(`${doc.ethHostUser}@${machine0}`, command, maxRetries)

  command = `export PATH="$HOME/.foundry/bin:$PATH" && cast send ${MaticTokenAddr} "approve(address,uint256)" ${StakeManagerProxyAddress} 100000000000000000000 --rpc-url http://localhost:9545 --private-key ${pkey}`
  await runSshCommand(`${doc.ethHostUser}@${machine0}`, command, maxRetries)

  command = `export PATH="$HOME/.foundry/bin:$PATH" && cast send ${StakeManagerProxyAddress} "restakePOL(uint256,uint256,bool)" ${validatorID} 100000000000000000000 false --rpc-url http://localhost:9545 --private-key ${pkey}`
  await runSshCommand(`${doc.ethHostUser}@${machine0}`, command, maxRetries)

  let newValidatorPower = await getValidatorPower(doc, machine0, validatorID)

  while (parseInt(newValidatorPower) !== parseInt(oldValidatorPower) + 100) {
    console.log('Waiting 3 secs for stakeupdate')
    await timer(3000) // waiting 3 secs
    newValidatorPower = await getValidatorPower(doc, machine0, validatorID)
    console.log('newValidatorPower : ', newValidatorPower)
  }

  console.log('✅ Stake Updated')
  console.log(
    '✅ Stake-Update event sent from rootchain, received and processed on Heimdall'
  )
}

async function getValidatorPower(doc, machine0, validatorID) {
  const command = `curl localhost:1317/stake/validator/${validatorID}`
  const out = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine0}`,
    command,
    maxRetries
  )
  const outObj = JSON.parse(out)
  return outObj.validator.voting_power
}
