import fs from 'fs'
import { loadDevnetConfig } from '../common/config-utils.js'
import { maxRetries, runScpCommand } from './remote-worker.js'
import Web3 from 'web3'
import dotenv from 'dotenv'
import { createAccountsFromMnemonics } from '../../lib/utils.js'

const EthAmount = '10'

const borProdChainIds = [137, 8001, 8002] // mainnet, mumbai, amoy

export async function fundAnvilAccounts(doc) {
  let machine0
  const devnetType =
    process.env.TF_VAR_DOCKERIZED === 'yes' ? 'docker' : 'remote'
  if (doc === undefined || doc == null) {
    dotenv.config({ path: `${process.cwd()}/.env` })

    doc = await loadDevnetConfig(devnetType)
  } else {
    machine0 = doc.devnetHeimdallHosts[0]
  }

  if (borProdChainIds.includes(doc.borChainId)) {
    console.log('📍Funding anvil accounts only works for the devnet')
    console.log('📍Skipping in case of mainnet or amoy')
    return
  }

  doc.devnetBorHosts.length > 0
    ? (machine0 = doc.devnetBorHosts[0])
    : (machine0 = doc.devnetErigonHosts[0])

  console.log('📍Transferring 10 ETH from anvil account[0] to all others...')

  const src = `${doc.ethHostUser}@${machine0}:~/matic-cli/devnet/devnet/signer-dump.json`
  const dest = './signer-dump.json'
  await runScpCommand(src, dest, maxRetries)

  const signerDump = JSON.parse(
    fs.readFileSync(`${process.cwd()}/signer-dump.json`, 'utf8')
  )

  const rootChainWeb3 = new Web3(`http://${machine0}:9545`)

  const mnemonic = process.env.MNEMONIC
  if (!mnemonic) {
    console.error(
      '❌ Error: MNEMONIC is not set. Please set it in the environment variables.'
    )
    process.exit(1)
  }

  const accounts = createAccountsFromMnemonics(mnemonic, 3)
  const anvilAccount = accounts[1]

  const account = rootChainWeb3.eth.accounts.privateKeyToAccount(
    anvilAccount.privateKey
  )
  rootChainWeb3.eth.accounts.wallet.add(account)

  // Set default account
  rootChainWeb3.eth.defaultAccount = account.address

  for (let i = 0; i < signerDump.length; i++) {
    const txReceipt = await rootChainWeb3.eth.sendTransaction({
      from: account.address,
      to: signerDump[i].address,
      gas: 21000,
      value: rootChainWeb3.utils.toWei(EthAmount, 'ether')
    })
    console.log(
      '📍Funds transferred from ' +
        account.address +
        ' to ' +
        signerDump[i].address +
        ' with txHash ' +
        txReceipt.transactionHash
    )
  }
}
