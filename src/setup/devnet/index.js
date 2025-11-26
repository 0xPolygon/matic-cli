// noinspection JSUnresolvedFunction,JSUnresolvedVariable

import inquirer from 'inquirer'
import { Listr } from 'listr2'
import path from 'path'
import chalk from 'chalk'
import execa from 'execa'
import fs from 'fs-extra'
import nunjucks from 'nunjucks'
import { bufferToHex, privateToPublic, toBuffer } from 'ethereumjs-util'

import { Heimdall } from '../heimdall/index.js'
import { Bor } from '../bor/index.js'
import { Anvil } from '../anvil/index.js'
import { Genesis } from '../genesis/index.js'
import { getDefaultBranch } from '../helper.js'
import {
  errorMissingConfigs,
  getAccountFromPrivateKey,
  getKeystoreFile,
  getNewPrivateKey,
  processTemplateFiles
} from '../../lib/utils.js'
import { loadConfig } from '../config.js'
import fileReplacer from '../../lib/file-replacer.js'
import { getRemoteStdio } from '../../express/common/remote-worker.js'
import { Erigon } from '../erigon/index.js'

const timer = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getAllFiles = function (dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath)

  arrayOfFiles = arrayOfFiles || []

  files.forEach(function (file) {
    if (fs.statSync(dirPath + '/' + file).isDirectory()) {
      if (file === 'bor' || file === 'heimdall' || file === 'erigon' || file === 'snapshot') {
        arrayOfFiles = getAllFiles(dirPath + '/' + file, arrayOfFiles)
      }
    } else {
      arrayOfFiles.push(path.join(dirPath, '/', file))
    }
  })

  return arrayOfFiles
}

export class Devnet {
  constructor(config) {
    this.config = config
  }

  get testnetDir() {
    return path.join(this.config.targetDirectory, 'devnet')
  }

  get signerDumpPath() {
    return path.join(this.testnetDir, 'signer-dump.json')
  }

  get signerDumpData() {
    const data = fs.readFileSync(this.signerDumpPath, 'utf8')
    return JSON.parse(data)
  }

  get totalBorNodes() {
    // noinspection JSUnresolvedVariable
    return this.config.numOfBorValidators + this.config.numOfBorSentries + this.config.numOfBorArchiveNodes
  }

  get totalErigonNodes() {
    return this.config.numOfErigonValidators + this.config.numOfErigonSentries + this.config.numOfErigonArchiveNodes
  }

  get totalNodes() {
    return this.totalBorNodes + this.totalErigonNodes
  }

  nodeDir(index) {
    return path.join(this.testnetDir, `node${index}`)
  }

  heimdallDir(index) {
    return path.join(this.nodeDir(index), 'heimdalld')
  }

  heimdallConfigFilePath(index) {
    return path.join(this.heimdallDir(index), 'config', 'config.toml')
  }

  heimdallGenesisFilePath(index) {
    return path.join(this.heimdallDir(index), 'config', 'genesis.json')
  }

  heimdallAppConfigFilePath(index) {
    return path.join(this.heimdallDir(index), 'config', 'app.toml')
  }

  borDir(index) {
    return path.join(this.nodeDir(index), 'bor')
  }

  borDataDir(index) {
    return path.join(this.borDir(index), 'data')
  }

  borKeystoreDir(index) {
    return path.join(this.borDir(index), 'keystore')
  }

  borGenesisFilePath(index) {
    return path.join(this.borDir(index), 'genesis.json')
  }

  borPasswordFilePath(index) {
    return path.join(this.borDir(index), 'password.txt')
  }

  borPrivateKeyFilePath(index) {
    return path.join(this.borDir(index), 'privatekey.txt')
  }

  borAddressFilePath(index) {
    return path.join(this.borDir(index), 'address.txt')
  }

  borNodeKeyPath(index) {
    return path.join(this.borDir(index), 'nodekey')
  }

  borEnodeFilePath(index) {
    return path.join(this.borDir(index), 'enode.txt')
  }

  borStaticNodesPath(index) {
    return path.join(this.borDir(index), 'static-nodes.json')
  }

  erigonDir(index) {
    return path.join(this.nodeDir(index), 'erigon')
  }

  erigonDataDir(index) {
    return path.join(this.erigonDir(index), 'data')
  }

  erigonKeystoreDir(index) {
    return path.join(this.erigonDir(index), 'keystore')
  }

  erigonGenesisFilePath(index) {
    return path.join(this.erigonDir(index), 'genesis.json')
  }

  erigonPasswordFilePath(index) {
    return path.join(this.erigonDir(index), 'password.txt')
  }

  erigonPrivateKeyFilePath(index) {
    return path.join(this.erigonDir(index), 'privatekey.txt')
  }

  erigonAddressFilePath(index) {
    return path.join(this.erigonDir(index), 'address.txt')
  }

  erigonNodeKeyPath(index) {
    return path.join(this.erigonDir(index), 'nodekey')
  }

  erigonEnodeFilePath(index) {
    return path.join(this.erigonDir(index), 'enode.txt')
  }

  erigonStaticNodesPath(index) {
    return path.join(this.erigonDir(index), 'static-nodes.json')
  }

  async getEnodeTask() {
    return {
      title: 'Setup enode',
      task: async () => {
        const staticNodes = []
        let hosts = []
        let erigonValCount = this.config.numOfErigonValidators
        hosts = this.config.devnetBorHosts.slice(0, this.config.numOfBorValidators)
        hosts.push(...this.config.devnetErigonHosts.slice(0, this.config.numOfErigonValidators))
        hosts.push(...this.config.devnetBorHosts.slice(this.config.numOfBorValidators, this.config.devnetBorHosts.length))
        hosts.push(...this.config.devnetErigonHosts.slice(this.config.numOfErigonValidators, this.config.devnetErigonHosts.length))
        // create new enode
        for (let i = 0; i < this.totalNodes; i++) {
          const enodeObj = await getNewPrivateKey()
          const pubKey = bufferToHex(
            privateToPublic(toBuffer(enodeObj.privateKey))
          ).replace('0x', '')

          // draft enode
          const enode = `enode://${pubKey}@${hosts[i]}:30303`
          // add into static nodes
          staticNodes.push(enode)

          // store data into nodekey and enode
          let nodeKeyPath = this.borNodeKeyPath(i)
          let enodeFilePath = this.borEnodeFilePath(i)
          if ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) {
            nodeKeyPath = this.erigonNodeKeyPath(i)
            enodeFilePath = this.erigonEnodeFilePath(i)
          }
          const p = [
            // create nodekey file
            fs.writeFile(
              nodeKeyPath,
              `${enodeObj.privateKey.replace('0x', '')}\n`,
              { mode: 0o600 }
            ),
            // create enode file
            fs.writeFile(enodeFilePath, `${enode}\n`, {
              mode: 0o600
            })
          ]
          await Promise.all(p)
          if (i >= this.config.numOfBorValidators) {
            erigonValCount--
          }
        }

        // create static-nodes
        erigonValCount = this.config.numOfErigonValidators
        const data = JSON.stringify(staticNodes, null, 2)
        for (let i = 0; i < this.totalNodes; i++) {
          let staticNodesPath = this.borStaticNodesPath(i)
          if ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) {
            staticNodesPath = this.erigonStaticNodesPath(i)
          }
          await fs.writeFile(staticNodesPath, data, { mode: 0o600 })
          if (i >= this.config.numOfBorValidators) {
            erigonValCount--
          }
        }
      }
    }
  }

  async getDockerTasks() {
    const enodeTask = await this.getEnodeTask()
    return [
      enodeTask,
      {
        title: 'Process Heimdall app configs',
        task: async () => {
          // set heimdall
          for (let i = 0; i < this.totalBorNodes; i++) {
            fileReplacer(this.heimdallAppConfigFilePath(i))
              .replace(
                /eth_rpc_url[ ]*=[ ]*".*"/gi,
                `eth_rpc_url = "${this.config.ethURL}"`
              )
              .replace(
                /bor_rpc_url[ ]*=[ ]*".*"/gi,
                `bor_rpc_url = "http://bor${i}:8545"`
              )
              .replace(
                /bor_grpc_flag[ ]*=[ ]*".*"/gi,
                'bor_grpc_flag = "false"'
              )
              .replace(
                /bor_grpc_url[ ]*=[ ]*".*"/gi,
                `bor_grpc_url = "bor${i}:3131"`
              )
              .replace(
                /amqp_url[ ]*=[ ]*".*"/gi,
                `amqp_url = "amqp://guest:guest@rabbit${i}:5672/"`
              )
              .replace(
                /span_poll_interval[ ]*=[ ]*".*"/gi,
                'span_poll_interval = "0m15s"'
              )
              .replace(
                /checkpoint_poll_interval[ ]*=[ ]*".*"/gi,
                'checkpoint_poll_interval = "1m0s"'
              )
              .save()
          }
        }
      },
      {
        title: 'Process Heimdall configs',
        task: async () => {
          // set heimdall
          for (let i = 0; i < this.totalBorNodes; i++) {
            fileReplacer(this.heimdallConfigFilePath(i))
              .replace(
                /laddr[ ]*=[ ]*"tcp:\/\/127\.0\.0\.1:26657"/gi,
                'laddr = "tcp://0.0.0.0:26657"'
              )
              .save()
          }
        }
      },
      {
        title: 'Process contract addresses',
        task: () => {
          // get root contracts
          const rootContracts = this.config.contractAddresses.root

          // set heimdall peers with devnet heimdall hosts
          for (let i = 0; i < this.totalBorNodes; i++) {
            fileReplacer(this.heimdallGenesisFilePath(i))
              .replace(
                /"pol_token_address":[ ]*".*"/gi,
                `"pol_token_address": "${rootContracts.tokens.MaticToken}"`
              )
              .replace(
                /"staking_manager_address":[ ]*".*"/gi,
                `"staking_manager_address": "${rootContracts.StakeManagerProxy}"`
              )
              .replace(
                /"root_chain_address":[ ]*".*"/gi,
                `"root_chain_address": "${rootContracts.RootChainProxy}"`
              )
              .replace(
                /"staking_info_address":[ ]*".*"/gi,
                `"staking_info_address": "${rootContracts.StakingInfo}"`
              )
              .replace(
                /"state_sender_address":[ ]*".*"/gi,
                `"state_sender_address": "${rootContracts.StateSender}"`
              )
              .replace(/"voting_period"\s*:\s*".*"/g, '"voting_period": "60s"')
              .replace(/"expedited_voting_period"\s*:\s*".*"/g, '"expedited_voting_period": "50s"')
              .save()
          }
        },
        enabled: () => {
          return this.config.contractAddresses
        }
      },
      {
        title: 'Process njk templates',
        task: async () => {
          const templateDir = path.resolve(
            new URL(import.meta.url).pathname,
            '../templates'
          )

          // copy docker related templates
          await fs.copy(
            path.join(templateDir, 'docker'),
            this.config.targetDirectory
          )

          // TODO: Uncomment when finalized for docker setup
          // if (this.config.network) {
          //  const chain = this.config.network
          //  for (let i = 0; i < this.totalBorNodes; i++) {
          //    fileReplacer(this.borGenesisFilePath(i))
          //      .replace(
          //        /NODE_DIR\/genesis.json/gi,
          //         `${chain}`
          //      )
          //      .save()
          //  }
          // }
          // process template files
          await processTemplateFiles(this.config.targetDirectory, {
            obj: this,
            anvil: this.anvil
          })

          for (let i = 0; i < this.totalBorNodes; i++) {
            await fs.copyFile(
              path.join(this.config.targetDirectory, 'docker-bor-config.toml'),
              path.join(this.borDir(i), 'config.toml')
            )
          }
        }
      }
    ]
  }

  async initRemoteTasks() {
    return new Listr([
      await this.getEnodeTask(),
      {
        title: 'Process Heimdall configs',
        task: async () => {
          // set heimdall
          for (let i = 0; i < this.totalNodes; i++) {
            fileReplacer(this.heimdallAppConfigFilePath(i))
              .replace(
                /eth_rpc_url[ ]*=[ ]*".*"/gi,
                `eth_rpc_url = "${this.config.ethURL}"`
              )
              .replace(
                /bor_rpc_url[ ]*=[ ]*".*"/gi,
                'bor_rpc_url = "http://localhost:8545"'
              )
              .replace(
                /bor_grpc_flag[ ]*=[ ]*".*"/gi,
                'bor_grpc_flag = "false"'
              )
              .replace(
                /bor_grpc_url[ ]*=[ ]*".*"/gi,
                'bor_grpc_url = "localhost:3131"'
              )
              .replace(
                /amqp_url[ ]*=[ ]*".*"/gi,
                'amqp_url = "amqp://guest:guest@localhost:5672/"'
              )
              .save()
          }
        }
      },
      {
        title: 'Process contract addresses',
        task: () => {
          // get root contracts
          const rootContracts = this.config.contractAddresses.root

          // set heimdall peers with devnet heimdall hosts
          for (let i = 0; i < this.totalNodes; i++) {
            fileReplacer(this.heimdallGenesisFilePath(i))
              .replace(
                /"pol_token_address":[ ]*".*"/gi,
                `"pol_token_address": "${rootContracts.tokens.MaticToken}"`
              )
              .replace(
                /"staking_manager_address":[ ]*".*"/gi,
                `"staking_manager_address": "${rootContracts.StakeManagerProxy}"`
              )
              .replace(
                /"root_chain_address":[ ]*".*"/gi,
                `"root_chain_address": "${rootContracts.RootChainProxy}"`
              )
              .replace(
                /"staking_info_address":[ ]*".*"/gi,
                `"staking_info_address": "${rootContracts.StakingInfo}"`
              )
              .replace(
                /"state_sender_address":[ ]*".*"/gi,
                `"state_sender_address": "${rootContracts.StateSender}"`
              )
              .replace(/"voting_period"\s*:\s*".*"/g, '"voting_period": "60s"')
              .replace(/"expedited_voting_period"\s*:\s*".*"/g, '"expedited_voting_period": "50s"')
              .save()
          }
        },
        enabled: () => {
          return this.config.contractAddresses && !this.config.network
        }
      },
      {
        title: 'Process njk templates',
        task: async () => {
          const templateDir = path.resolve(
            new URL(import.meta.url).pathname,
            '../templates'
          )

          // copy remote related templates
          await fs.copy(
            path.join(templateDir, 'remote'),
            this.config.targetDirectory
          )

          // promises
          const p = []
          const signerDumpData = this.signerDumpData
          // process njk files
          for (const file of getAllFiles(this.config.targetDirectory, [])) {
            if (file.indexOf('.njk') !== -1) {
              let erigonValCount = this.config.numOfErigonValidators
              const fp = path.join(this.config.targetDirectory, file)

              // process all njk files and copy to each node directory
              for (let i = 0; i < this.totalNodes; i++) {
                const file2array = file.split('/')
                const file2 = file2array[file2array.length - 1]
                if (((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) && file2.indexOf('bor') !== -1) {
                  erigonValCount--
                  continue
                }

                if ((i < this.config.numOfBorValidators || (i >= this.config.numOfBorValidators + this.config.numOfErigonValidators && i < this.totalBorNodes + this.config.numOfErigonValidators)) && file2.indexOf('erigon') !== -1) {
                  continue
                }

                if ((!this.config.network || !this.config.snapshot || this.config.snapshot === 'false') && file2.indexOf('snapshot') !== -1) {
                  continue
                }

                fs.writeFileSync(
                  path.join(this.nodeDir(i), file2.replace('.njk', '')),
                  nunjucks.render(file, {
                    obj: this,
                    node: i,
                    signerData: signerDumpData[i]
                  })
                )
              }

              // remove njk file
              p.push(
                execa('rm', ['-rf', fp], {
                  cwd: this.config.targetDirectory,
                  stdio: getRemoteStdio()
                })
              )
            }
          }

          // fulfill all promises
          await Promise.all(p)
        }
      }],
    {
      concurrent: true
    })
  }

  async getAria2cInsallTask(host, user) {
    return new Listr([
      {
        title: 'Install Aria2c',
        task: async () => {
          await execa(
            'ssh',
            [
              '-o',
              'StrictHostKeyChecking=no',
              '-o',
              'UserKnownHostsFile=/dev/null',
              '-i',
              '~/cert.pem',
                `${user}@${host}`,
                'sudo apt-get update -y && sudo apt-get install -y zstd pv aria2'
            ],
            { stdio: getRemoteStdio() })
        },
        enabled: () => {
          return this.config.network && this.config.snapshot === 'true'
        }
      }
    ])
  }

  async getSnapshotSyncTasks() {
    const hosts = []
    const users = []
    const serviceArr = []
    const chaindataArr = []
    let erigonValCount = this.config.numOfErigonValidators
    for (let i = 0; i < this.totalNodes; i++) {
      hosts[i] = this.config.devnetBorHosts[i]
      users[i] = this.config.devnetBorUsers[i]
      serviceArr[i] = 'bor.service'
      chaindataArr[i] = '.bor/data/bor/chaindata'
      if (i >= this.config.numOfBorValidators && erigonValCount > 0) {
        hosts[i] = this.config.devnetErigonHosts[i - this.config.numOfNonBorValidators]
        users[i] = this.config.devnetErigonUsers[i - this.config.numOfBorValidators]
        serviceArr[i] = 'erigon.service'
        chaindataArr[i] = '.erigon/data/erigon/chaindata'
      }
      if (i >= this.totalBorNodes + this.config.numOfErigonValidators) {
        hosts[i] = this.config.devnetErigonHosts[i - (this.totalBorNodes + this.config.numOfErigonValidators)]
        users[i] = this.config.devnetErigonUsers[i - (this.totalBorNodes + this.config.numOfErigonValidators)]
        serviceArr[i] = 'erigon.service'
        chaindataArr[i] = '.erigon/data/erigon/chaindata'
      }
      if (i >= this.config.numOfBorValidators) {
        erigonValCount--
      }
    }

    for (let i = 0; i < hosts.length; i++) {
      const aria2cInstallTask = await this.getAria2cInsallTask(hosts[i], users[i])
      await aria2cInstallTask.run()
    }

    return new Listr([
      {
        title: 'Download heimdall snapshot',
        task: async () => {
          for (let i = 0; i < hosts.length; i++) {
            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                  `${users[i]}@${hosts[i]}`,
                  'sudo systemctl stop heimdalld.service && sudo rm -rf /var/lib/heimdall/data/*'
              ],
              { stdio: getRemoteStdio() })

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-o',
                'ServerAliveInterval=6000',
                '-i',
                '~/cert.pem',
                `${users[i]}@${hosts[i]}`,
                `bash ~/node/inc-snapshot.sh <<< $'${this.config.network}\nheimdall\n/var/lib/heimdall/data\n'`
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                  `${users[i]}@${hosts[i]}`,
                  'sudo systemctl restart heimdalld.service'
              ],
              { stdio: getRemoteStdio() })
          }
        },
        enabled: () => {
          return this.config.network && this.config.snapshot === 'true'
        }
      },
      {
        title: 'Download bor snapshot',
        task: async () => {
          for (let i = 0; i < hosts.length; i++) {
            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${users[i]}@${hosts[i]}`,
                `sudo systemctl stop ${serviceArr[i]} && sudo rm -rf ${chaindataArr[i]}/*`
              ],
              { stdio: getRemoteStdio() })

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-o',
                'ServerAliveInterval=6000',
                '-i',
                '~/cert.pem',
                  `${users[i]}@${hosts[i]}`,
                  `bash ~/node/inc-snapshot.sh <<< $'${this.config.network}\nbor\n${chaindataArr[i]}\n'`
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                    `${users[i]}@${hosts[i]}`,
                    `sudo systemctl restart ${serviceArr[i]}`
              ],
              { stdio: getRemoteStdio() })
          }
        },
        enabled: () => {
          return this.config.network && this.config.snapshot === 'true'
        }
      }
    ],
    { concurrent: false })
  }

  async getRemoteTasks() {
    const initRemoteTasks = await this.initRemoteTasks()
    await initRemoteTasks.run()

    return [
      {
        title: 'Copy files to remote servers',
        task: async () => {
          if (this.config.devnetBorHosts === undefined || this.config.devnetErigonHosts === undefined) {
            return
          }
          // copy the Anvil files to the first node
          const anvilURL = new URL(this.config.ethURL)
          const anvilUser = this.config.ethHostUser

          if (!this.config.network) {
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/anvil-start.sh`,
                `${anvilUser}@${anvilURL.hostname}:~/anvil-start.sh`
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-r',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/data`,
                `${anvilUser}@${anvilURL.hostname}:~/data`
              ],
              { stdio: getRemoteStdio() }
            )
          }

          // Generate service files
          // Bor
          for (let i = 0; i < this.totalBorNodes; i++) {
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/bor-service.sh`,
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}:~/bor-service.sh`
              ],
              { stdio: getRemoteStdio() }
            )

            if (i === 0 && !this.config.network && this.config.numOfBorValidators !== 0) {
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                                `bash ${this.config.targetDirectory}/bor-service-host.sh ${this.config.devnetBorFlags[i]}`
              ], { stdio: getRemoteStdio() })

              // NOTE: Target location would vary depending on bor/heimdall version. Currently the setup works with bor and heimdall v0.3.x
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                                'sudo mv ~/anvil.service /lib/systemd/system/'
              ], { stdio: getRemoteStdio() })
            }
            await execa('ssh', [
              '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              '-i', '~/cert.pem',
                            `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                            `bash ~/bor-service.sh ${this.config.devnetBorFlags[i]}`
            ], { stdio: getRemoteStdio() })

            await execa('ssh', [
              '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              '-i', '~/cert.pem',
                            `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                            'sudo mv ~/bor.service /lib/systemd/system/'
            ], { stdio: getRemoteStdio() })

            if (this.config.network) {
              const chain = this.config.network
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                      `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                      // eslint-disable-next-line
                      `sed -i "s|\\/var/lib/heimdall/config/genesis.json|${chain}|g" ~/heimdalld.service`
              ], { stdio: getRemoteStdio() })
            }

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo mv ~/heimdalld.service /lib/systemd/system/'
              ],
              { stdio: getRemoteStdio() }
            )
          }

          // Erigon
          for (let i = 0; i < this.totalErigonNodes; i++) {
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/erigon-service.sh`,
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}:~/erigon-service.sh`
              ],
              { stdio: getRemoteStdio() }
            )

            if (i === 0 && !this.config.network && this.config.numOfBorValidators === 0) {
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                                `bash ${this.config.targetDirectory}/erigon-service-host.sh`
              ], { stdio: getRemoteStdio() })

              // NOTE: Target location would vary depending on bor/heimdall version. Currently the setup works with bor and heimdall v0.3.x
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                                'sudo mv ~/anvil.service /lib/systemd/system/'
              ], { stdio: getRemoteStdio() })
            }
            await execa('ssh', [
              '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              '-i', '~/cert.pem',
                            `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                            'bash ~/erigon-service.sh'
            ], { stdio: getRemoteStdio() })

            await execa('ssh', [
              '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              '-i', '~/cert.pem',
                            `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                            'sudo mv ~/erigon.service /lib/systemd/system/'
            ], { stdio: getRemoteStdio() })

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                'sudo mv ~/heimdalld.service /lib/systemd/system/'
              ],
              { stdio: getRemoteStdio() }
            )
          }

          // Bor
          for (let i = 0; i < this.totalBorNodes; i++) {
            // copy files to remote servers
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/code/bor/build/bin/bor`,
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}:~/go/bin/bor`
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/code/heimdall-v2/build/heimdalld`,
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}:~/go/bin/heimdalld`
              ],
              { stdio: getRemoteStdio() }
            )

            let nodeDir = `${this.testnetDir}/node${i}/`
            if (i >= this.config.numOfBorValidators) {
              nodeDir = `${this.testnetDir}/node${i + this.config.numOfErigonValidators}/`
            }
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-r',
                '-i',
                '~/cert.pem',
                nodeDir,
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}:~/node/`
              ],
              { stdio: getRemoteStdio() }
            )

            // Execute service files
            if (i === 0 && !this.config.network && this.config.numOfBorValidators !== 0) {
              await execa(
                'ssh',
                [
                  '-o',
                  'StrictHostKeyChecking=no',
                  '-o',
                  'UserKnownHostsFile=/dev/null',
                  '-i',
                  '~/cert.pem',
                  `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                  'sudo systemctl start anvil.service'
                ],
                {
                  stdio: getRemoteStdio(),
                  env: {
                    ...process.env,
                    PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}`
                  }
                }
              )
            }

            if (i >= this.config.numOfBorValidators + this.config.numOfBorSentries) {
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                    `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                    // eslint-disable-next-line
                    `sed -i '$s,$, \\\\,' ~/node/bor-start.sh`
              ], { stdio: getRemoteStdio() })

              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                    `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                    // eslint-disable-next-line
                    `printf %s "  --gcmode 'archive'" >> ~/node/bor-start.sh `
              ], { stdio: getRemoteStdio() })

              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                    `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                    // eslint-disable-next-line
                    `sed -i '$s,$, \\\\,' ~/node/bor-start-config.sh`
              ], { stdio: getRemoteStdio() })

              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                    `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                    // eslint-disable-next-line
                    `printf %s "  --gcmode 'archive'" >> ~/node/bor-start-config.sh `
              ], { stdio: getRemoteStdio() })
            }

            if (this.config.network) {
              const chain = this.config.network
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                      `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                      // eslint-disable-next-line
                      `sed -i "s|\\$BOR_HOME/genesis.json|${chain}|g" ~/node/bor-start.sh`
              ], { stdio: getRemoteStdio() })

              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                      `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                      // eslint-disable-next-line
                      `sed -i "s|\\$BOR_HOME/genesis.json|${chain}|g" ~/node/bor-start-config.sh`
              ], { stdio: getRemoteStdio() })
            }

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'bash ~/node/heimdalld-setup.sh'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo cp ~/go/bin/heimdalld /usr/bin/heimdalld && sudo chmod +x /usr/bin/heimdalld'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo cp ~/go/bin/bor /usr/bin/bor && sudo chmod +x /usr/bin/bor'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo systemctl start heimdalld.service'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'bash ~/node/bor-setup.sh '
              ],
              { stdio: getRemoteStdio() }
            )

            await execa('ssh', [
              '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              '-i', '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo systemctl start bor.service'
            ], { stdio: getRemoteStdio() })
          }

          // Erigon
          let j = this.totalBorNodes + this.config.numOfErigonValidators
          for (let i = 0; i < this.totalErigonNodes; i++) {
            // copy files to remote servers
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/code/erigon/build/bin/erigon`,
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}:~/go/bin/erigon`
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.targetDirectory}/code/heimdall-v2/build/heimdalld`,
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}:~/go/bin/heimdalld`
              ],
              { stdio: getRemoteStdio() }
            )

            let nodeDir = `${this.testnetDir}/node${j}/`
            if (i < this.config.numOfErigonValidators) {
              nodeDir = `${this.testnetDir}/node${this.config.numOfBorValidators + i}/`
            }
            await execa(
              'scp',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-r',
                '-i',
                '~/cert.pem',
                nodeDir,
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}:~/node/`
              ],
              { stdio: getRemoteStdio() }
            )

            // Execute service files
            if (i === 0 && !this.config.network && this.config.numOfBorValidators === 0) {
              await execa(
                'ssh',
                [
                  '-o',
                  'StrictHostKeyChecking=no',
                  '-o',
                  'UserKnownHostsFile=/dev/null',
                  '-i',
                  '~/cert.pem',
                  `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                  'sudo systemctl start anvil.service'
                ],
                { stdio: getRemoteStdio() }
              )
            }

            if (i < this.config.numOfErigonValidators) {
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem', `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                // eslint-no-multi-spaces
                'sed -i \'s|snapshots=false$|snapshots=false \\\\\\\n    --mine \\\\\\\n    --miner.etherbase $(cat "$ERIGON_HOME/address.txt") \\\\\\\n    --miner.sigfile "$ERIGON_HOME/privatekey.txt"|\' ~/node/erigon-start.sh'
              ], { stdio: getRemoteStdio() })
            }

            if (this.config.network) {
              let chain = this.config.network
              if (chain === 'mainnet') {
                chain = 'bor-mainnet'
              }
              // TODO: Finalize when running a public node
              // await execa('ssh', [
              //   '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              //   '-i', '~/cert.pem',
              //         `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
              //         // eslint-disable-next-line
              //         `sed -i "s|\\$ERIGON_HOME/genesis.json|${chain}|g" ~/node/erigon-start.sh`
              // ], { stdio: getRemoteStdio() })
            }

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                'bash ~/node/heimdalld-setup.sh'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                'sudo cp ~/go/bin/heimdalld /usr/bin/heimdalld && sudo chmod +x /usr/bin/heimdalld'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo cp ~/go/bin/bor /usr/bin/bor && sudo chmod +x /usr/bin/bor'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetBorUsers[i]}@${this.config.devnetBorHosts[i]}`,
                'sudo cp ~/go/bin/bor /usr/bin/bor && sudo chmod +x /usr/bin/bor'],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                'sudo systemctl start heimdalld.service'
              ],
              { stdio: getRemoteStdio() }
            )

            await execa(
              'ssh',
              [
                '-o',
                'StrictHostKeyChecking=no',
                '-o',
                'UserKnownHostsFile=/dev/null',
                '-i',
                '~/cert.pem',
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                'bash ~/node/erigon-setup.sh '
              ],
              { stdio: getRemoteStdio() }
            )

            await execa('ssh', [
              '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
              '-i', '~/cert.pem',
                `${this.config.devnetErigonUsers[i]}@${this.config.devnetErigonHosts[i]}`,
                'sudo systemctl start erigon.service'
            ], { stdio: getRemoteStdio() })

            if (i >= this.config.numOfErigonValidators) {
              j++
            }
          }
        }
      }
    ]
  }

  async getCreateTestnetTask(heimdall) {
    return new Listr([
      heimdall.cloneRepositoryTask(),
      heimdall.buildTask(),
      {
        title: 'Create testnet files for Heimdall',
        task: async () => {
          const args = [
            'create-testnet',
            '--home', 'devnet',
            '--v',
            this.config.numOfBorValidators + this.config.numOfErigonValidators,
            '--n',
            this.config.numOfBorSentries + this.config.numOfBorArchiveNodes + this.config.numOfErigonSentries + this.config.numOfErigonArchiveNodes,
            '--chain-id',
            this.config.heimdallChainId,
            '--node-host-prefix',
            'heimdall',
            '--output-dir',
            'devnet'
          ]

          // Create heimdall folders
          if (this.config.devnetType === 'remote') {
            // create heimdall folder for all the nodes in remote setup
            let host, user
            for (let i = 0; i < this.totalNodes; i++) {
              user = this.config.devnetBorUsers[i]
              host = this.config.devnetBorHosts[i]
              if (i >= this.totalBorNodes) {
                user = this.config.devnetErigonUsers[i - this.totalBorNodes]
                host = this.config.devnetErigonHosts[i - this.totalBorNodes]
              }
              await execa('ssh', [
                '-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null',
                '-i', '~/cert.pem',
                 `${user}@${host}`,
                 'sudo mkdir -p /var/lib/heimdall && sudo chmod 777 -R /var/lib/heimdall/'
              ], { stdio: getRemoteStdio() })
            }
          }

          // create testnet if a public network isn't specified
          await execa(heimdall.heimdalldCmd, args, {
            cwd: this.config.targetDirectory,
            stdio: getRemoteStdio()
          })

          if (this.config.network) {
            for (let i = 0; i < this.totalNodes; i++) {
              await execa('rm', ['-rf', `${this.heimdallDir(i)}`], {
                stdio: getRemoteStdio()
              })

              await execa(`${heimdall.heimdalldCmd}`, [
                'init', `--chain-id=${this.config.network}`, `--home=${this.heimdallDir(i)}`
              ], { stdio: getRemoteStdio(), cwd: this.config.targetDirectory })
            }
          }

          // set heimdall peers with devnet heimdall hosts
          for (let i = 0; i < this.totalNodes; i++) {
            fileReplacer(this.heimdallConfigFilePath(i))
              .replace(/heimdall([^:]+):/gi, (d, index) => {
                return `${this.config.devnetHeimdallHosts[index]}:`
              })
              .replace(/moniker.+=.+/gi, `moniker = "heimdall${i}"`)
              .replace(
                /laddr[ ]*=[ ]*"tcp:\/\/127\.0\.0\.1:26657"/gi,
                'laddr = "tcp://0.0.0.0:26657"'
              )
              .save()

            if (this.config.network) {
              const heimdallSeeds = this.config.heimdallSeeds.join()
              fileReplacer(this.heimdallConfigFilePath(i))
                .replace(/persistent_peers.+=.+/gi, `persistent_peers = "${heimdallSeeds}"`)
                .save()

              fileReplacer(this.heimdallConfigFilePath(i))
                .replace(/seeds.+=.+/gi, `seeds = "${heimdallSeeds}"`)
                .save()
            }
            fileReplacer(this.heimdallGenesisFilePath(i))
              .replace(
                /"bor_chain_id"[ ]*:[ ]*".*"/gi,
                `"bor_chain_id": "${this.config.borChainId}"`
              )
              .replace(/"voting_period"\s*:\s*".*"/g, '"voting_period": "60s"')
              .replace(/"expedited_voting_period"\s*:\s*".*"/g, '"expedited_voting_period": "50s"')
              .save()
          }
        }
      }
    ])
  }

  async borTask(bor) {
    return new Listr([{
      title: bor.taskTitle,
      task: () => {
        return bor.getTasks()
      },
      enabled: () => {
        return this.config.devnetType === 'remote'
      }
    }])
  }

  async genesisTask(genesis) {
    return new Listr([{
      title: genesis.taskTitle,
      task: () => {
        // get genesis tasks
        return genesis.getTasks()
      }
    }])
  }

  async accountTask() {
    return new Listr([{
      title: 'Setup accounts',
      task: () => {
        // set validator addresses
        const genesisAddresses = []
        const signerDumpData = this.signerDumpData
        for (let i = 0; i < this.config.numOfBorValidators; i++) {
          const d = signerDumpData[i]
          genesisAddresses.push(d.address)
        }

        let j = this.config.numOfBorValidators
        for (let i = 0; i < this.config.numOfErigonValidators; i++) {
          const d = signerDumpData[j]
          genesisAddresses.push(d.address)
          j++
        }
        // set genesis addresses
        this.config.genesisAddresses = genesisAddresses

        // signerDumpData contains an uncompressed public key that was not generated by a web3.js account,
        // but is required for anvil-stake.sh to perform staking.
        // We remove the '04' prefix from the uncompressed public key
        // (as it is not needed) and associate the modified key with each web3.js account object.
        this.config.accounts = this.signerDumpData
          .slice(0, this.config.numOfBorValidators)
          .map((s) => {
            const account = getAccountFromPrivateKey(s.priv_key)

            // Extract key from the format 'PubKeySecp256k1{04...}'
            const match = s.pub_key.match(/{(.*)}/)
            let sanitizedPubKey = s.pub_key

            if (match) {
              const keyWithPrefix = match[1] // Extract the key inside braces
              sanitizedPubKey = keyWithPrefix.startsWith('04')
                ? '0x' + keyWithPrefix.slice(2) // Remove '04' and add '0x'
                : '0x' + keyWithPrefix
            }

            return { ...account, pub_key: sanitizedPubKey }
          })

        if (this.config.numOfErigonValidators > 0) {
          const erigonAccounts = this.signerDumpData
            .slice(this.config.numOfBorValidators, this.config.numOfBorValidators + this.config.numOfErigonValidators)
            .map((s) => {
              const account = getAccountFromPrivateKey(s.priv_key)
              return { ...account, pub_key: s.pub_key }
            })

          erigonAccounts.forEach((acc) => {
            this.config.accounts.push(acc)
          })
        }
      }
    }])
  }

  async getDockerOrRemoteTask() {
    return new Listr([{
      title: 'Docker',
      task: async () => {
        const tasks = await this.getDockerTasks()
        return new Listr(tasks, { concurrent: true })
      },
      enabled: () => {
        return this.config.devnetType === 'docker'
      }
    },
    {
      title: 'Remote',
      task: async () => {
        const tasks = await this.getRemoteTasks()
        return new Listr(tasks)
      },
      enabled: () => {
        return this.config.devnetType === 'remote'
      }
    }])
  }

  async getTasks() {
    const anvil = this.anvil
    const heimdall = this.heimdall
    const bor = this.bor
    const genesis = this.genesis
    const erigon = this.erigon

    // create testnet tasks
    const createTestnetTasks = await this.getCreateTestnetTask(heimdall)
    await createTestnetTasks.run()

    const accountTasks = await this.accountTask()
    await accountTasks.run()

    if (!this.config.network) {
      const genesisTasks = await this.genesisTask(genesis)
      await genesisTasks.run()
    }

    return new Listr([
      {
        title: bor.taskTitle,
        task: () => {
          return bor.getTasks()
        },
        enabled: () => {
          return this.config.devnetType === 'remote' && this.totalBorNodes > 0
        }
      },
      {
        title: erigon.taskTitle,
        task: () => {
          return erigon.getTasks()
        },
        enabled: () => {
          return this.config.devnetType === 'remote' && this.totalErigonNodes > 0
        }
      },
      {
        title: 'Setup Bor/Erigon keystore and genesis files',
        task: async () => {
          const signerDumpData = this.signerDumpData
          let erigonValCount = this.config.numOfErigonValidators
          for (let i = 0; i < this.totalNodes; i++) {
            // create directories
            if ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) {
              await execa(
                'mkdir',
                ['-p', this.erigonDataDir(i), this.erigonKeystoreDir(i)],
                { stdio: getRemoteStdio() }
              )
            } else {
              await execa(
                'mkdir',
                ['-p', this.borDataDir(i), this.borKeystoreDir(i)],
                { stdio: getRemoteStdio() }
              )
            }
            const password = `password${i}`

            // create keystore files
            const keystoreFileObj = getKeystoreFile(
              signerDumpData[i].priv_key,
              password
            )
            const p = [
              // save password file
              ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) ? fs.writeFile(this.erigonPasswordFilePath(i), `${password}\n`) : fs.writeFile(this.borPasswordFilePath(i), `${password}\n`),

              // save private key file
              ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators)
                ? fs.writeFile(
                  this.erigonPrivateKeyFilePath(i),
                  `${signerDumpData[i].priv_key.substring(2)}\n`
                )
                : fs.writeFile(
                  this.borPrivateKeyFilePath(i),
                  `${signerDumpData[i].priv_key}\n`
                ),

              // save address file
              ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators)
                ? fs.writeFile(
                  this.erigonAddressFilePath(i),
                  `${signerDumpData[i].address}\n`
                )
                : fs.writeFile(
                  this.borAddressFilePath(i),
                  `${signerDumpData[i].address}\n`
                ),
              // save keystore file
              ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators)
                ? fs.writeFile(
                  path.join(
                    this.erigonKeystoreDir(i),
                    keystoreFileObj.keystoreFilename
                  ),
                  JSON.stringify(keystoreFileObj.keystore, null, 2)
                )
                : fs.writeFile(
                  path.join(
                    this.borKeystoreDir(i),
                    keystoreFileObj.keystoreFilename
                  ),
                  JSON.stringify(keystoreFileObj.keystore, null, 2)
                )
            ]

            if (!this.config.network) {
              // copy genesis file to each node bor directory if a public network isn't specified
              // Add additional fields for erigon
              if ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) {
                p.push(execa(
                  'cp',
                  [genesis.borGenesisFilePath, this.erigonGenesisFilePath(i)],
                  { stdio: getRemoteStdio() }
                ),
                execa(
                  'jq',
                  ['\'.config.consensus = "bor" | .config.bor.agraBlock = .config.shanghaiBlock | del(.config.shanghaiBlock)\'', `${this.erigonGenesisFilePath(i)} > ~/tmp.json && mv ~/tmp.json ${this.erigonGenesisFilePath(i)}`],
                  { shell: true }
                )
                )
              } else {
                p.push(execa(
                  'cp',
                  [genesis.borGenesisFilePath, this.borGenesisFilePath(i)],
                  { stdio: getRemoteStdio() }
                )
                )
              }
            }
            await Promise.all(p)
            if (i >= this.config.numOfBorValidators) {
              erigonValCount--
            }
          }
        }
      },
      {
        title: anvil.taskTitle,
        task: () => {
          return anvil.getTasks()
        },
        enabled: () => {
          return (this.config.devnetType === 'docker' || 'remote') && !this.config.network
        }
      },
      {
        title: 'Remove multiple keystore files',
        task: async () => {
          let erigonValCount = this.config.numOfErigonValidators
          for (let i = 0; i < this.totalNodes; i++) {
            // remove multiple keystore files from node[i]/bor/keystore
            let keystoreDir
            keystoreDir = path.join(
              this.testnetDir,
              `node${i}`,
              'bor',
              'keystore'
            )
            if ((i >= this.config.numOfBorValidators && erigonValCount > 0) || i >= this.totalBorNodes + this.config.numOfErigonValidators) {
              keystoreDir = path.join(
                this.testnetDir,
                `node${i}`,
                'erigon',
                'keystore'
              )
            }
            fs.readdir(keystoreDir, async (err, files) => {
              if (err) console.log(err) // harmless
              if (files) {
                for (let j = 1; j < files.length; j++) {
                  await fs.unlink(path.join(keystoreDir, files[j]))
                }
              }
            })
            await timer(2000)
            if (i >= this.config.numOfBorValidators) {
              erigonValCount--
            }
          }
        },
        enabled: () => {
          return this.config.devnetType === 'docker' || 'remote'
        }
      }
    ],
    {
      concurrent: true
    })
  }
}

async function setupDevnet(config) {
  const devnet = new Devnet(config)
  devnet.anvil = new Anvil(config, {
    contractsBranch: config.contractsBranch
  })
  devnet.bor = new Bor(config, {
    repositoryUrl: config.borRepo,
    repositoryBranch: config.borBranch,
    dockerContext: config.borDockerBuildContext
  })
  devnet.erigon = new Erigon(config, {
    repositoryUrl: config.erigonRepo,
    repositoryBranch: config.erigonBranch
  })
  devnet.heimdall = new Heimdall(config, {
    repositoryUrl: config.heimdallRepo,
    repositoryBranch: config.heimdallBranch,
    dockerContext: config.heimdallDockerBuildContext
  })
  devnet.genesis = new Genesis(config, {
    repositoryUrl: config.genesisContractsRepo,
    repositoryBranch: config.genesisContractsBranch
  })

  const tasks = await devnet.getTasks()
  await tasks.run()

  const dockerOrRemoteTasks = await devnet.getDockerOrRemoteTask()
  await dockerOrRemoteTasks.run()

  if (devnet.config.devnetType === 'remote' && devnet.config.network) {
    const snapshotTasks = await devnet.getSnapshotSyncTasks()
    await snapshotTasks.run()
  }

  console.log('%s Devnet is ready', chalk.green.bold('DONE'))
}

export async function getHosts(n) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'devnetHosts',
      message: 'Please enter comma separated hosts/IPs',
      validate: (input) => {
        const hosts = input.split(',').map((a) => {
          return a.trim().toLowerCase()
        })

        if (hosts.length === 0 || hosts.length !== n) {
          return `Enter valid ${n} hosts/IPs (comma separated)`
        }

        return true
      }
    }
  ])

  return answers.devnetHosts.split(',').map((a) => {
    return a.trim().toLowerCase()
  })
}

export async function getUsers(n) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'devnetUsers',
      message: 'Please enter comma separated Users',
      validate: (input) => {
        const hosts = input.split(',').map((a) => {
          return a.trim().toLowerCase()
        })

        if (hosts.length === 0 || hosts.length !== n) {
          return `Enter valid ${n} Users (comma separated)`
        }

        return true
      }
    }
  ])

  return answers.devnetHosts.split(',').map((a) => {
    return a.trim().toLowerCase()
  })
}

export default async function (command) {
  // configuration
  const config = await loadConfig({
    targetDirectory: command.parent.directory,
    fileName: command.parent.config,
    interactive: command.parent.interactive
  })
  await config.loadChainIds()

  // load branch
  let answers = await getDefaultBranch(config)
  config.set(answers)

  const questions = []
  if (!('numOfBorValidators' in config)) {
    questions.push({
      type: 'number',
      name: 'numOfBorValidators',
      message: 'Please enter number of Bor validator nodes',
      default: 2
    })
  }

  if (!('numOfBorSentries' in config)) {
    questions.push({
      type: 'number',
      name: 'numOfBorSentries',
      message: 'Please enter number of Bor sentry nodes',
      default: 0
    })
  }

  if (!('numOfBorArchiveNodes' in config)) {
    questions.push({
      type: 'number',
      name: 'numOfBorArchiveNodes',
      message: 'Please enter number of Bor archive nodes',
      default: 0
    })
  }

  if (!('numOfErigonValidators' in config)) {
    questions.push({
      type: 'number',
      name: 'numOfErigonValidators',
      message: 'Please enter number of Erigon validator nodes',
      default: 2
    })
  }

  if (!('numOfErigonSentries' in config)) {
    questions.push({
      type: 'number',
      name: 'numOfErigonSentries',
      message: 'Please enter number of Erigon sentry nodes',
      default: 0
    })
  }

  if (!('numOfErigonArchiveNodes' in config)) {
    questions.push({
      type: 'number',
      name: 'numOfErigonArchiveNodes',
      message: 'Please enter number of Erigon archive nodes',
      default: 0
    })
  }

  if (!('ethURL' in config)) {
    questions.push({
      type: 'input',
      name: 'ethURL',
      message: 'Please enter ETH url',
      default: 'http://anvil:9545'
    })
  }

  if (!('ethHostUser' in config)) {
    questions.push({
      type: 'input',
      name: 'ethHostUser',
      message: 'Please enter ETH host',
      default: 'ubuntu'
    })
  }

  if (!('devnetType' in config)) {
    questions.push({
      type: 'list',
      name: 'devnetType',
      message: 'Please select devnet type',
      choices: ['docker', 'remote']
    })
  }

  if (!config.interactive) {
    errorMissingConfigs(
      questions.map((q) => {
        return q.name
      })
    )
  }

  answers = await inquirer.prompt(questions)
  config.set(answers)

  // set devent hosts
  let devnetBorHosts = config.devnetBorHosts || []
  const devnetBorUsers = config.devnetBorUsers || []
  let devnetHeimdallHosts = config.devnetHeimdallHosts || []
  const devnetHeimdallUsers = config.devnetHeimdallUsers || []
  const devnetErigonHosts = config.devnetErigonHosts || []
  const devnetErigonUsers = config.devnetErigonUsers || []
  const totalBorNodes = config.numOfBorValidators + config.numOfBorSentries + config.numOfBorArchiveNodes

  // set devnet bor flags
  const devnetBorFlags = config.devnetBorFlags || []

  // For docker, the devnetBorHosts conform to the subnet 172.20.1.0/24
  if (config.devnetType === 'docker') {
    devnetBorHosts = []
    devnetHeimdallHosts = []
    for (let i = 0; i < totalBorNodes; i++) {
      devnetBorHosts.push(`172.20.1.${i + 100}`)
      devnetHeimdallHosts.push(`heimdall${i}`)
    }
  }
  config.set({
    devnetBorHosts,
    devnetBorUsers,
    devnetHeimdallHosts,
    devnetHeimdallUsers,
    devnetErigonHosts,
    devnetErigonUsers,
    devnetBorFlags
  })

  // start setup
  await setupDevnet(config)
}
