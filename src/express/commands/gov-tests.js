import { loadDevnetConfig } from '../common/config-utils.js'
import { timer } from '../common/time-utils.js'
import {
  runSshCommand,
  runSshCommandWithReturn,
  maxRetries
} from '../common/remote-worker.js'
import {
  testMetadata,
  testProposal,
  expeditedMetadata,
  expeditedProposal,
  updateGovParamsMetadata,
  updateGovParamsProposal
} from '../common/proposals.js'
import { importValidatorKeysOnHost } from '../common/heimdall-utils.js'
import dotenv from 'dotenv'

export async function sendGovTestsCommand() {
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
    `echo '${testMetadata}' > ~/draft_metadata.json`,
    maxRetries
  )
  console.log(`✅ draft_metadata.json saved on host ${machine0}`)

  console.log('📍Writing draft_proposal.json on primary host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${testProposal}' > ~/draft_proposal.json`,
    maxRetries
  )
  console.log(`✅ draft_proposal.json saved on host ${machine0}`)

  const chainId = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine0}`,
    "jq -r '.chain_id' /var/lib/heimdall/config/genesis.json",
    maxRetries
  )
  console.log('Chain ID:', chainId.trim())

  console.log('📍 PROPOSAL_STATUS_PASSED Testcase')

  // Check proposal count before submission
  let beforeCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals before submission:', beforeCount)

  const submitProposalCommand = `printf 'test-test\\n' | heimdalld tx gov submit-proposal draft_proposal.json --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    submitProposalCommand,
    maxRetries
  )

  await timer(5000)

  // Check proposal count after submission
  let afterCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals after submission:', afterCount)

  if (afterCount > beforeCount) {
    console.log('✅ Proposal submitted successfully')
  } else {
    console.log('❌ Proposal submission failed')
  }

  console.log(`📍Depositing 200 POL to proposal #${afterCount}`)
  let depositCommand = `printf 'test-test\\n' | heimdalld tx gov deposit ${afterCount} 200000000000000000000pol --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  for (const machine of borValidatorHosts) {
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      depositCommand,
      maxRetries
    )
    console.log(`✅ Deposit command executed on host ${machine}`)
    await timer(3000)
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
    console.log(`✅ Vote command executed on host ${machine}`)
    await timer(3000)
  }

  await timer(60000) // Wait for 1 minute
  console.log('📍Checking proposal status…')

  // Check proposal status
  let status = await getProposalStatus(doc, machine0, afterCount)
  if (status === 'PROPOSAL_STATUS_PASSED') {
    console.log('✅ Proposal passed successfully')
  } else {
    console.error(`❌ Proposal status: ${status}`)
  }

  console.log('✅ PROPOSAL_STATUS_PASSED Testcase passed')

  console.log('📍 PROPOSAL_STATUS_REJECTED Testcase')

  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    submitProposalCommand,
    maxRetries
  )

  await timer(5000)

  // Check proposal count after submission
  afterCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals after submission:', afterCount)

  if (afterCount > beforeCount) {
    console.log('✅ Proposal submitted successfully')
  } else {
    console.log('❌ Proposal submission failed')
  }

  console.log(`📍Depositing 200 POL to proposal #${afterCount}`)
  depositCommand = `printf 'test-test\\n' | heimdalld tx gov deposit ${afterCount} 200000000000000000000pol --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  for (const machine of borValidatorHosts) {
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      depositCommand,
      maxRetries
    )
    console.log(`✅ Deposit command executed on host ${machine}`)
    await timer(3000)
  }

  console.log(
    `📍 Casting NO vote on proposal #${afterCount} from each validator…`
  )
  for (const machine of borValidatorHosts) {
    const voteCommand = `printf 'test-test\\n' | heimdalld tx gov vote ${afterCount} no --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      voteCommand,
      maxRetries
    )
    console.log(`✅ Vote command executed on host ${machine}`)
    await timer(3000)
  }

  await timer(60000) // Wait for 1 minute
  console.log('📍Checking proposal status…')

  // Check proposal status
  status = await getProposalStatus(doc, machine0, afterCount)
  if (status === 'PROPOSAL_STATUS_REJECTED') {
    console.log('✅ Proposal rejected successfully')
  } else {
    console.error(`❌ Proposal status: ${status}`)
  }

  console.log('✅ PROPOSAL_STATUS_REJECTED Testcase passed')

  console.log('📍 EXPEDITED_PROPOSAL Testcase')

  console.log('📍Writing expedited draft_metadata.json on host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${expeditedMetadata}' > ~/expedited_metadata.json`,
    maxRetries
  )
  console.log(`✅ expedited_metadata.json saved on host ${machine0}`)

  console.log('📍Writing expedited draft_proposal.json on host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${expeditedProposal}' > ~/expedited_proposal.json`,
    maxRetries
  )
  console.log(`✅ expedited_proposal.json saved on host ${machine0}`)

  // Check proposal count before submission
  beforeCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals before expedited submission:', beforeCount)

  const submitExpedited = `printf 'test-test\\n' | heimdalld tx gov submit-proposal expedited_proposal.json --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    submitExpedited,
    maxRetries
  )

  await timer(5000)

  // Check proposal count after submission
  afterCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals after expedited submission:', afterCount)

  if (afterCount > beforeCount) {
    console.log('✅ Expedited proposal submitted successfully')
  } else {
    console.log('❌ Expedited proposal submission failed')
  }

  console.log(`📍Depositing 500 POL to expedited proposal #${afterCount}`)
  const expeditedDeposit = `printf 'test-test\\n' | heimdalld tx gov deposit ${afterCount} 500000000000000000000pol --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  for (const machine of borValidatorHosts) {
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      expeditedDeposit,
      maxRetries
    )
    console.log(`✅ Expedited deposit executed on host ${machine}`)
    await timer(3000)
  }

  console.log(`📍Casting YES vote on expedited proposal #${afterCount}`)
  for (const machine of borValidatorHosts) {
    const voteCmd = `printf 'test-test\\n' | heimdalld tx gov vote ${afterCount} yes --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
    await runSshCommand(`${doc.ethHostUser}@${machine}`, voteCmd, maxRetries)
    console.log(`✅ Vote on expedited proposal executed on host ${machine}`)
    await timer(2000)
  }

  await timer(60000) // Wait for 1 minute
  console.log('📍Checking expedited proposal status…')

  status = await getProposalStatus(doc, machine0, afterCount)
  if (status === 'PROPOSAL_STATUS_PASSED') {
    console.log('✅ Expedited proposal passed successfully')
  } else {
    console.error(`❌ Expedited proposal status: ${status}`)
  }

  console.log('📍 gov.MsgUpdateParam Testcase')

  console.log('📍Writing draft_metadata.json on primary host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${updateGovParamsMetadata}' > ~/draft_metadata.json`,
    maxRetries
  )
  console.log(`✅ draft_metadata.json saved on host ${machine0}`)

  console.log('📍Writing draft_proposal.json on primary host:', machine0)
  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    `echo '${updateGovParamsProposal}' > ~/draft_proposal.json`,
    maxRetries
  )
  console.log(`✅ draft_proposal.json saved on host ${machine0}`)

  // Check proposal count before submission
  beforeCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals before submission:', beforeCount)

  await runSshCommand(
    `${doc.ethHostUser}@${machine0}`,
    submitProposalCommand,
    maxRetries
  )

  await timer(5000)

  // Check proposal count after submission
  afterCount = await getProposalCount(doc, machine0)
  console.log('🔍 Proposals after submission:', afterCount)

  if (afterCount > beforeCount) {
    console.log('✅ Proposal submitted successfully')
  } else {
    console.log('❌ Proposal submission failed')
  }

  console.log(`📍Depositing 200 POL to proposal #${afterCount}`)
  depositCommand = `printf 'test-test\\n' | heimdalld tx gov deposit ${afterCount} 200000000000000000000pol --from test --home /var/lib/heimdall/ --chain-id ${chainId.trim()} -y`
  for (const machine of borValidatorHosts) {
    await runSshCommand(
      `${doc.ethHostUser}@${machine}`,
      depositCommand,
      maxRetries
    )
    console.log(`✅ Deposit command executed on host ${machine}`)
    await timer(3000)
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
    console.log(`✅ Vote command executed on host ${machine}`)
    await timer(2000)
  }

  await timer(60000) // Wait for 1 minute
  console.log('📍Checking proposal status…')

  // Check proposal status
  status = await getProposalStatus(doc, machine0, afterCount)
  if (status === 'PROPOSAL_STATUS_PASSED') {
    console.log('✅ Proposal passed successfully')
  } else {
    console.error(`❌ Proposal status: ${status}`)
  }

  console.log('✅ gov.MsgUpdateParam Testcase passed')

  console.log('📍Verifying if voting_period has been updated to 75s...')

  const isVotingPeriodUpdated = await verifyVotingPeriodUpdate(doc, machine0)

  if (isVotingPeriodUpdated) {
    console.log('✅ voting_period successfully updated to 75s')
  } else {
    console.error('❌ voting_period update failed or mismatch detected')
  }
}

export async function getProposalCount(doc, machine) {
  const cmd = 'curl -s localhost:1317/cosmos/gov/v1/proposals'
  const out = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine}`,
    cmd,
    maxRetries
  )
  const outObj = JSON.parse(out)
  return outObj.pagination.total
}

export async function getProposalStatus(doc, machine, proposalId) {
  const cmd = `curl -s localhost:1317/cosmos/gov/v1/proposals/${proposalId}`
  const out = await runSshCommandWithReturn(
    `${doc.ethHostUser}@${machine}`,
    cmd,
    maxRetries
  )
  const obj = JSON.parse(out)
  return obj.proposal.status
}

async function verifyVotingPeriodUpdate(doc, machine) {
  try {
    const cmd = 'curl -s localhost:1317/cosmos/gov/v1/params/voting'
    const out = await runSshCommandWithReturn(
      `${doc.ethHostUser}@${machine}`,
      cmd,
      maxRetries
    )
    const obj = JSON.parse(out)
    const currentVotingPeriod = obj.voting_params?.voting_period || ''

    console.log(`🔍 Current voting_period from chain: ${currentVotingPeriod}`)

    return currentVotingPeriod === '75s'
  } catch (error) {
    console.error('❌ Error verifying voting_period:', error.message)
    return false
  }
}
