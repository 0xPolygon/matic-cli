import {
  runSshCommandWithReturn,
  runSshCommandWithoutExit,
  maxRetries
} from './remote-worker.js'

export async function importValidatorKeysOnHost(host, user) {
  console.log(`📍Processing host: ${host}`)
  try {
    // Fetch base64-encoded private key
    const base64Key = await runSshCommandWithReturn(
      `${user}@${host}`,
      "jq -r '.priv_key.value' /var/lib/heimdall/config/priv_validator_key.json",
      maxRetries
    )
    // Convert to hex
    const hexKey = await runSshCommandWithReturn(
      `${user}@${host}`,
      `echo "${base64Key.trim()}" | base64 -d | xxd -p -c 256`,
      maxRetries
    )
    console.log('📍Importing validator private key into Heimdall keyring')
    // 3) import into heimdalld keyring
    try {
      await runSshCommandWithoutExit(
        `${user}@${host}`,
        `printf $'test-test\\ntest-test\\n' | heimdalld keys import-hex test ${hexKey.trim()} --home /var/lib/heimdall`,
        1
      )
      console.log(`✅ Validator private key imported on host ${host}`)
    } catch {
      console.log(`❌ Key import error on host ${host} (might already exist)`)
    }
  } catch (err) {
    console.error(
      `❌ Failed fetching/importing key on host ${host}:`,
      err.message
    )
  }
}

export async function fetchBalance(user, host, address) {
  const out = await runSshCommandWithReturn(
    `${user}@${host}`,
    `curl -s localhost:1317/cosmos/bank/v1beta1/balances/${address}`,
    maxRetries
  )
  const balance = JSON.parse(out).balances[0].amount
  return balance
}

export async function assertBalanceDecreased(
  user,
  host,
  validatorAddr,
  beforeBalance
) {
  const afterBalance = await fetchBalance(user, host, validatorAddr)
  if (afterBalance >= beforeBalance) {
    throw new Error(
      `🚨 Balance did not decrease on ${host}: before=${beforeBalance}, after=${afterBalance}`
    )
  }
  console.log(
    `✅ Balance on ${host} decreased: ${beforeBalance} → ${afterBalance}`
  )
}
