// noinspection JSUnresolvedVariable

import { Listr } from 'listr2'
import execa from 'execa'
import chalk from 'chalk'
import inquirer from 'inquirer'
import path from 'path'
import fs from 'fs'
import { isValidAddress } from 'ethereumjs-util'

import { loadConfig } from '../config.js'
import { cloneRepository, errorMissingConfigs } from '../../lib/utils.js'
import { getRemoteStdio } from '../../express/common/remote-worker.js'

// balance
const DEFAULT_BALANCE = 1000000000 // 1 Billion - Without 10^18

export class Genesis {
  constructor(config, options = {}) {
    this.config = config

    this.repositoryName = this.name
    this.repositoryBranch = options.repositoryBranch || 'master'
    this.repositoryUrl =
      options.repositoryUrl || 'https://github.com/0xPolygon/genesis-contracts'
    this.maticContractsRepository = 'matic-contracts'
  }

  get name() {
    return 'genesis-contracts'
  }

  get taskTitle() {
    return 'Setup genesis contracts'
  }

  get repositoryDir() {
    return path.join(this.config.codeDir, this.repositoryName)
  }

  get maticContractDir() {
    return path.join(
      this.config.codeDir,
      this.repositoryName,
      this.maticContractsRepository
    )
  }

  get borGenesisFilePath() {
    return path.join(this.repositoryDir, 'genesis.json')
  }

  async print() {
    console.log(
      chalk.gray('Bor genesis path') +
        ': ' +
        chalk.bold.green(this.borGenesisFilePath)
    )
  }

  // get genesis contact tasks
  async getTasks() {
    return new Listr(
      [
        {
          title: 'Clone genesis-contracts repository',
          task: () =>
            cloneRepository(
              this.repositoryName,
              this.repositoryBranch,
              this.repositoryUrl,
              this.config.codeDir
            )
        },
        {
          title: 'Install dependencies for genesis-contracts',
          task: () =>
            execa('npm', ['install', '--omit=dev'], {
              cwd: this.repositoryDir,
              stdio: getRemoteStdio()
            })
        },
        {
          title: 'Setting up sub-modules',
          task: () =>
            execa('git', ['submodule', 'init'], {
              cwd: this.repositoryDir,
              stdio: getRemoteStdio()
            })
        },
        {
          title: 'Update sub-modules',
          task: () =>
            execa('git', ['submodule', 'update'], {
              cwd: this.repositoryDir,
              stdio: getRemoteStdio()
            })
        },
        {
          title: 'Install dependencies for matic-contracts',
          task: () =>
            execa('npm', ['install', '--omit=dev'], {
              cwd: this.maticContractDir
            })
        },
        {
          title: 'Process genesis contracts templates',
          task: () =>
            execa(
              'npm',
              [
                'run',
                'template:process',
                '--',
                '--bor-chain-id',
                this.config.borChainId
              ],
              {
                cwd: this.maticContractDir,
                stdio: getRemoteStdio()
              }
            )
        },

        {
          title: 'Adding forge to path',
          task: () =>
            execa('bash', ['-c', 'export PATH="$HOME/.foundry/bin:$PATH"'], {
              stdio: getRemoteStdio()
            })
        },
        {
          title: 'Compile matic-contracts',
          task: () =>
            execa('forge', ['build'], {
              env: {
                ...process.env,
                PATH: `${process.env.HOME}/.foundry/bin:${process.env.PATH}`
              },
              stdio: getRemoteStdio()
            })
        },
        {
          title: 'Prepare validators for genesis file',
          task: () => {
            const validators = this.config.genesisAddresses.map((a) => {
              return {
                address: a,
                stake: this.config.defaultStake, // without 10^18
                balance: DEFAULT_BALANCE // without 10^18
              }
            })

            return Promise.resolve()
              .then(() => {
                // check if validators js exists
                const validatorJsPath = path.join(
                  this.repositoryDir,
                  'validators.js'
                )
                if (!fs.existsSync(validatorJsPath)) {
                  return
                }

                // take validator js backup
                return execa('mv', ['validators.js', 'validators.js.backup'], {
                  cwd: this.repositoryDir,
                  stdio: getRemoteStdio()
                })
              })
              .then(() => {
                fs.writeFileSync(
                  path.join(this.repositoryDir, 'validators.json'),
                  JSON.stringify(validators, null, 2),
                  'utf8'
                )
              })
          }
        },
        {
          title: 'Configure Block time',
          task: () => {
            const blocks = []
            const blockTimes = this.config.blockTime.toString().split(',')
            const blockNumbers = this.config.blockNumber.toString().split(',')

            for (let i = 0; i < blockTimes.length; i++) {
              blocks[i] = {
                number: blockNumbers[i],
                time: blockTimes[i]
              }
            }

            return Promise.resolve()
              .then(() => {
                const blockJsPath = path.join(this.repositoryDir, 'blocks.js')
                if (!fs.existsSync(blockJsPath)) {
                  return
                }

                // Backup of the block time config
                return execa('mv', ['blocks.js', 'blocks.js.backup'], {
                  cwd: this.repositoryDir,
                  stdio: getRemoteStdio()
                })
              })
              .then(() => {
                fs.writeFileSync(
                  path.join(this.repositoryDir, 'blocks.json'),
                  JSON.stringify(blocks, null, 2)
                )
              })
          }
        },
        {
          title: 'Configure Sprint Size',
          task: () => {
            const sprintSizesArr = []
            const sprintSizes = this.config.sprintSize.toString().split(',')
            const sprintSizeBlockNumbers = this.config.sprintSizeBlockNumber
              .toString()
              .split(',')

            for (let i = 0; i < sprintSizes.length; i++) {
              sprintSizesArr[i] = {
                number: sprintSizeBlockNumbers[i],
                sprintSize: sprintSizes[i]
              }
            }

            return Promise.resolve()
              .then(() => {
                const blockJsPath = path.join(
                  this.repositoryDir,
                  'sprintSizes.js'
                )
                if (!fs.existsSync(blockJsPath)) {
                  return
                }

                // Backup of the block time config
                return execa(
                  'mv',
                  ['sprintSizes.js', 'sprintSizes.js.backup'],
                  {
                    cwd: this.repositoryDir,
                    stdio: getRemoteStdio()
                  }
                )
              })
              .then(() => {
                fs.writeFileSync(
                  path.join(this.repositoryDir, 'sprintSizes.json'),
                  JSON.stringify(sprintSizesArr, null, 64)
                )
              })
          }
        },
        {
          title: 'Generate Bor validator set',
          task: () =>
            execa(
              'node',
              [
                'generate-borvalidatorset.js',
                '--bor-chain-id',
                this.config.borChainId,
                '--heimdall-chain-id',
                this.config.heimdallChainId
              ],
              {
                cwd: this.repositoryDir,
                stdio: getRemoteStdio()
              }
            )
        },
        {
          title: 'Generate genesis.json',
          task: () =>
            execa(
              'node',
              [
                'generate-genesis.js',
                '--bor-chain-id',
                this.config.borChainId,
                '--heimdall-chain-id',
                this.config.heimdallChainId
              ],
              {
                cwd: this.repositoryDir,
                stdio: getRemoteStdio()
              }
            )
        }
      ],
      {
        exitOnError: true
      }
    )
  }
}

export async function getGenesisAddresses(config) {
  const questions = []

  if (!config.genesisAddresses) {
    questions.push({
      type: 'input',
      name: 'genesisAddresses',
      message: 'Please enter comma separated validator addresses',
      default: '0x6c468CF8c9879006E22EC4029696E005C2319C9D',
      validate: (input) => {
        const addrs = input
          .split(',')
          .map((a) => {
            return a.trim().toLowerCase()
          })
          .filter((a) => {
            return isValidAddress(a)
          })

        // check if addrs has any valid address
        if (addrs.length === 0) {
          return 'Enter valid addresses (comma separated)'
        }

        return true
      }
    })
  }

  if (!config.interactive) {
    errorMissingConfigs(
      questions.map((q) => {
        return q.name
      })
    )
  }

  const answers = await inquirer.prompt(questions)

  // set genesis addresses
  return answers.genesisAddresses.split(',').map((a) => {
    return a.trim().toLowerCase()
  })
}

async function setupGenesis(config) {
  const genesis = new Genesis(config)

  // load genesis addresses
  config.genesisAddresses = await getGenesisAddresses(config)

  // get all genesis related tasks
  const tasks = await genesis.getTasks()

  // run all tasks
  await tasks.run()
  console.log('%s Genesis file is ready', chalk.green.bold('DONE'))

  // print genesis path
  await genesis.print()

  return true
}

export default async function (command) {
  // configuration
  const config = await loadConfig({
    targetDirectory: command.parent.directory,
    fileName: command.parent.config,
    interactive: command.parent.interactive
  })
  await config.loadChainIds()

  // start setup
  await setupGenesis(config)
}
