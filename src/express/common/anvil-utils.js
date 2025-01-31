import fs from 'fs'
import { loadDevnetConfig } from '../common/config-utils.js'
import { maxRetries, runScpCommand } from './remote-worker.js'
import { createAccountsFromMnemonics } from '../../lib/utils.js'
import Web3 from 'web3'
import dotenv from 'dotenv'

const EthAmount = '10'

const borProdChainIds = [137, 8001, 8002] // mainnet, mumbai, amoy

// Since we might reset and restart ganache multiple times during the setup,
// and  considered that ganache is no longer maintained, plus
// it is affected by this issue https://github.com/trufflesuite/ganache/issues/4404
// we implemented this workaround waiting for a migration to hardhat
// (see internal issue https://polygon.atlassian.net/browse/POS-1869)
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
    console.log('📍Fund anvil accounts only works for devnet')
    console.log('📍Skipping in case of mainnet, mumbai or amoy')
    return
  }

  doc.devnetBorHosts.length > 0
    ? (machine0 = doc.devnetBorHosts[0])
    : (machine0 = doc.devnetErigonHosts[0])

  console.log('📍Transferring funds from anvil account[0] to others...')

  console.log('doc : ', doc)
  //const unlockedAccouts = createAccountsFromMnemonics()
  const accounts = await rootChainWeb3.eth.getAccounts();
  console.log("Available Accounts:", accounts);
  const anvilAccount = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

  const src = `${doc.ethHostUser}@${machine0}:~/matic-cli/devnet/devnet/signer-dump.json`
  const dest = './signer-dump.json'
  await runScpCommand(src, dest, maxRetries)

  const signerDump = JSON.parse(
    fs.readFileSync(`${process.cwd()}/signer-dump.json`, 'utf8')
  )

  const rootChainWeb3 = new Web3(`http://${machine0}:9545`)

  for (let i = 0; i < signerDump.length; i++) {
    const txReceipt = await rootChainWeb3.eth.sendTransaction({
      to: signerDump[i].address,
      from: signerDump[0],
      value: rootChainWeb3.utils.toWei(EthAmount, 'ether')
    })
    console.log(
      '📍Funds transferred from ' +
        anvilAccount +
        ' to ' +
        signerDump[i].address +
        ' with txHash ' +
        txReceipt.transactionHash
    )
  }
}
