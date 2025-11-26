import { loadDevnetConfig } from '../common/config-utils.js'
import { timer } from '../common/time-utils.js'
import {
  runSshCommand,
  runSshCommandWithReturn,
  maxRetries
} from '../common/remote-worker.js'
import { getProposalCount, getProposalStatus } from './gov-tests.js'
import {
  updateAuthParamsMetadata,
  updateAuthParamsProposal
} from '../common/proposals.js'
import {
  importValidatorKeysOnHost,
  fetchBalance
} from '../common/heimdall-utils.js'
import dotenv from 'dotenv'

export async function sendAuthAndBankTestsCommand() {
  dotenv.config({ path: `${process.cwd()}/.env` })
  const devnetType =
    process.env.TF_VAR_DOCKERIZED === 'yes' ? 'docker' : 'remote'

  const doc = await loadDevnetConfig(devnetType)
  let machine0

  // Only use validator nodes for validator actions.
  const borValidatorCount =
    doc.numOfBorValidators ||
    Number(process.env.TF_VAR_BOR_VALIDATOR_COUNT) ||
    0
  const borValidatorHosts = Array.isArray(doc.devnetBorHosts)
    ? doc.devnetBorHosts.slice(0, borValidatorCount)
    : []

  if (borValidatorCount > 0 && borValidatorHosts.length > 0) {
    machine0 = borValidatorHosts[0]
    console.log('📍Monitoring the first bor validator node', machine0)
  } else {
    console.log(
      '📍No validator nodes to monitor, please check your configs! Exiting...'
    )
    process.exit(1)
  }

  // Import validator keys only on validator nodes
  if (Array.isArray(borValidatorHosts) && borValidatorHosts.length > 0) {
    for (const machine of borValidatorHosts) {
      await importValidatorKeysOnHost(machine, doc.ethHostUser)
    }
  }
  console.log('📍Validator keys imported on all validator hosts')

  console.log('📍Writing draft_metadata.json on primary host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${updateAuthParamsMetadata}' > ~/draft_metadata.json`,
    maxRetries
  )
  console.log(`✅ draft_metadata.json saved on host ${machine0}`)

  console.log('📍Writing draft_proposal.json on primary host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${updateAuthParamsProposal}' > ~/draft_proposal.json`,
    maxRetries
  )
  console.log(`✅ draft_proposal.json saved on host ${machine0}`)

  const chainId = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine0}`,
    "jq -r '.chain_id' /var/lib/heimdall/config/genesis.json",
    maxRetries
  )
  console.log('Chain ID:', chainId.trim())

  console.log('📍 Fetching auth params BEFORE proposal submission')
  const beforeParams = await getAuthParams(doc, machine0)
  const afterParams = {
    max_memo_characters: '512',
    tx_sig_limit: '1',
    tx_size_cost_per_byte: '20',
    sig_verify_cost_ed25519: '600',
    sig_verify_cost_secp256k1: '1100',
    max_tx_gas: '10000000',
    tx_fees: '10000000000000000'
  }

  const allMatchBefore = Object.entries(afterParams).every(
    ([k, v]) => String(beforeParams[k]) === v
  )

  if (allMatchBefore) {
    throw new Error(
      '🚨 Auth params already match the expected values BEFORE proposal aborting'
    )
  } else {
    console.log('✅ Auth params differ BEFORE update, as expected')
  }

  // Check proposal count before submission
  const beforeCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals before submission:', beforeCount)

  const submitProposalCommand = `printf 'test-test\\n' | heimdalld tx gov submit-proposal draft_proposal.json --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    submitProposalCommand,
    maxRetries
  )

  await timer(10000)

  // Check proposal count after submission
  const afterCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals after submission:', afterCount)

  if (afterCount > beforeCount) {
    console.log('✅ Proposal submitted successfully')
  } else {
    console.log('❌ Proposal submission failed')
  }

  console.log(`📍Depositing 200 POL to proposal #${afterCount}`)
  const depositCommand = `printf 'test-test\\n' | heimdalld tx gov deposit ${afterCount} 200000000000000000000pol --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  for (const machine of borValidatorHosts) {
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      depositCommand,
      maxRetries
    )
    console.log(`✅ Deposit command executed on validator host ${machine}`)
    await timer(5000)
  }

  console.log(
    `📍 Casting YES vote on proposal #${afterCount} from each validator…`
  )
  for (const machine of borValidatorHosts) {
    const voteCommand = `printf 'test-test\\n' | heimdalld tx gov vote ${afterCount} yes --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      voteCommand,
      maxRetries
    )
    console.log(`✅ Vote command executed on validator host ${machine}`)
    await timer(5000)
  }

  await timer(75000) // Wait for 75 secs
  console.log('📍Checking proposal status…')

  // Check proposal status
  const status = await getProposalStatus(doc, machine0, afterCount)
  if (status === 'PROPOSAL_STATUS_PASSED') {
    console.log('✅ Proposal passed successfully')
  } else {
    console.error(`❌ Proposal status: ${status}`)
  }

  console.log('✅ auth.MsgUpdateParam Testcase passed')

  console.log('📍 Verifying auth params updated')
  const ok = await verifyAuthParamsUpdate(doc, machine0)
  console.log('🔍 Auth params match expected:', ok)
  if (!ok) throw new Error('Auth params update verification failed')

  console.log('✅ Auth module param update test succeeded')

  // Bank Send Test
  const randomAddress = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine0}`,
    "printf 'test-test\\n' | heimdalld keys add random --home /var/lib/heimdall --no-backup --output json 2>/dev/null | awk '/^{/,/}$/p' | jq -r .address",
    maxRetries
  )
  console.log('Random address generated:', randomAddress.trim())

  const sendAmount = '1000000000000000000pol'
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `printf 'test-test\\n' | heimdalld tx bank send test ${randomAddress} ${sendAmount} --home /var/lib/heimdall --chain-id ${chainId.trim()} -y`,
    maxRetries
  )

  console.log(`✅ Sent ${sendAmount} from test to random`)
  await timer(10000)

  const balance = await fetchBalance(
    doc.ethHostUser,
    machine0,
    randomAddress.trim()
  )

  if (balance === sendAmount.replace('pol', '')) {
    console.log('✅ Bank send test passed')
  } else {
    console.error(
      '❌ Bank send test failed, expected:',
      sendAmount,
      'got:',
      balance
    )
  }
}

async function getAuthParams(doc, machine) {
  const out = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine}`,
    'curl -s localhost:1317/cosmos/auth/v1beta1/params',
    maxRetries
  )
  return JSON.parse(out).params
}

async function verifyAuthParamsUpdate(doc, machine) {
  const current = await getAuthParams(doc, machine)
  const expected = {
    max_memo_characters: '512',
    tx_sig_limit: '1',
    tx_size_cost_per_byte: '20',
    sig_verify_cost_ed25519: '600',
    sig_verify_cost_secp256k1: '1100',
    max_tx_gas: '10000000',
    tx_fees: '10000000000000000'
  }
  return Object.entries(expected).every(([k, v]) => String(current[k]) === v)
}
