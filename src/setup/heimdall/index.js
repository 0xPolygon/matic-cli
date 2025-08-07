// noinspection JSUnresolvedFunction,JSUnresolvedVariable

import { Listr } from 'listr2'
import execa from 'execa'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'

import fileReplacer from '../../lib/file-replacer.js'
import { loadConfig } from '../config.js'
import {
  cloneRepository,
  compressedPublicKey,
  privateKeyToPublicKey,
  processTemplateFiles
} from '../../lib/utils.js'
import { getDefaultBranch } from '../helper.js'
import { Anvil } from '../anvil/index.js'
import { getRemoteStdio } from '../../express/common/remote-worker.js'

export class Heimdall {
  constructor(config, options = {}) {
    this.config = config

    this.repositoryName = this.name
    this.repositoryBranch = options.repositoryBranch || 'develop'
    this.repositoryUrl =
      options.repositoryUrl || 'https://github.com/0xPolygon/heimdall-v2'
    this.dockerContext =
      options.dockerContext ||
      'https://github.com/0xPolygon/heimdall-v2.git#develop'
  }

  get name() {
    return 'heimdall-v2'
  }

  get taskTitle() {
    return 'Setup heimdall-v2'
  }

  get validatorKeyFile() {
    return 'priv_validator_key.json'
  }

  get configValidatorKeyFilePath() {
    return path.join(this.config.configDir, this.validatorKeyFile)
  }

  get configValidatorKeyFile() {
    const data = fs.readFileSync(this.configValidatorKeyFilePath, 'utf8')
    return JSON.parse(data)
  }

  get repositoryDir() {
    if (
      this.dockerContext !== undefined &&
      !this.dockerContext.startsWith('http')
    ) {
      return this.dockerContext
    } else {
      return path.join(this.config.codeDir, this.repositoryName)
    }
  }

  get buildDir() {
    return path.join(this.repositoryDir, 'build')
  }

  get heimdalldCmd() {
    return path.join(this.buildDir, 'heimdalld')
  }

  get heimdallDataDir() {
    return path.join(this.config.dataDir, 'heimdall-v2')
  }

  get heimdallConfigDir() {
    return path.join(this.heimdallDataDir, 'config')
  }

  get heimdallGenesisFilePath() {
    return path.join(this.heimdallConfigDir, 'genesis.json')
  }

  get heimdallAppConfigFilePath() {
    return path.join(this.heimdallConfigDir, 'app.toml')
  }

  get heimdallConfigFilePath() {
    return path.join(this.heimdallConfigDir, 'config.toml')
  }

  get heimdallValidatorKeyFilePath() {
    return path.join(this.heimdallConfigDir, this.validatorKeyFile)
  }

  async print() {
    // print details
    console.log(
      chalk.gray('Heimdall home') +
        ': ' +
        chalk.bold.green(this.heimdallDataDir)
    )
    console.log(
      chalk.gray('Heimdall genesis') +
        ': ' +
        chalk.bold.green(this.heimdallGenesisFilePath)
    )
    console.log(
      chalk.gray('Heimdall validator key') +
        ': ' +
        chalk.bold.green(this.heimdallValidatorKeyFilePath)
    )
    console.log(
      chalk.gray('Heimdall repo') + ': ' + chalk.bold.green(this.repositoryDir)
    )
    console.log(
      chalk.gray('Setup heimdall') +
        ': ' +
        chalk.bold.green('bash heimdall-start.sh')
    )
    console.log(
      chalk.gray('Reset heimdall') +
        ': ' +
        chalk.bold.green('bash heimdall-clean.sh')
    )
  }

  // returns content of validator key
  async generateValidatorKey() {
    return execa(
      this.heimdalldCmd,
      [
        'generate-validator-key',
        this.config.primaryAccount.privateKey,
        '--home',
        this.heimdallDataDir
      ],
      {
        cwd: this.config.configDir,
        stdio: getRemoteStdio()
      }
    ).then(() => {
      return this.configValidatorKeyFile
    })
  }

  async getProcessGenesisFileTasks() {
    return new Listr(
      [
        {
          title: 'Process Heimdall and Bor chain ids',
          task: () => {
            fileReplacer(this.heimdallGenesisFilePath)
              .replace(
                /"chain_id":[ ]*".*"/gi,
                `"chain_id": "${this.config.heimdallChainId}"`
              )
              .replace(
                /"bor_chain_id":[ ]*".*"/gi,
                `"bor_chain_id": "${this.config.borChainId}"`
              )
              .save()
          }
        },
        {
          title: 'Process validators',
          task: () => {
            fileReplacer(this.heimdallGenesisFilePath)
              .replace(
                /"address":[ ]*".*"/gi,
                `"address": "${this.config.primaryAccount.address}"`
              )
              .replace(
                /"signer":[ ]*".*"/gi,
                `"signer": "${this.config.primaryAccount.address}"`
              )
              .replace(
                /"pub_key":[ ]*".*"/gi,
                `"pub_key": "${compressedPublicKey(
                  privateKeyToPublicKey(
                    this.config.primaryAccount.privateKey
                  ).replace('0x', '0x04')
                )}"`
              )
              .replace(
                /"power":[ ]*".*"/gi,
                `"power": "${this.config.defaultStake}"`
              )
              .replace(
                /"user":[ ]*".*"/gi,
                `"user": "${this.config.primaryAccount.address}"`
              )
              .replace(/"voting_period"\s*:\s*".*"/g, '"voting_period": "60s"')
              .replace(
                /"expedited_voting_period"\s*:\s*".*"/g,
                '"expedited_voting_period": "50s"'
              )
              .save()
          }
        },
        {
          title: 'Process contract addresses',
          task: () => {
            // get root contracts
            const rootContracts = this.config.contractAddresses.root

            fileReplacer(this.heimdallGenesisFilePath)
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
              .save()
          },
          enabled: () => {
            return this.config.contractAddresses
          }
        }
      ],
      {
        exitOnError: true,
        concurrent: true
      }
    )
  }

  cloneRepositoryTask() {
    return {
      title: 'Clone Heimdall repository',
      task: () =>
        cloneRepository(
          this.repositoryName,
          this.repositoryBranch,
          this.repositoryUrl,
          this.config.codeDir
        )
    }
  }

  buildTask() {
    return {
      title: 'Build Heimdall',
      task: () =>
        execa('make', ['build', 'network=local'], {
          cwd: this.repositoryDir,
          stdio: getRemoteStdio()
        })
    }
  }

  async getTasks() {
    return new Listr(
      [
        this.cloneRepositoryTask(),
        this.buildTask(),
        {
          title: 'Init Heimdall',
          task: () => {
            return execa(
              this.heimdalldCmd,
              [
                'init',
                '--home',
                this.heimdallDataDir,
                '--chain-id',
                this.heimdallChainId,
                'heimdall-test'
              ],
              {
                cwd: this.repositoryDir,
                stdio: getRemoteStdio()
              }
            )
          }
        },
        {
          title: 'Create Heimdall account from private key',
          task: () => {
            // It generates new account for validator
            // and replaces it with new validator key
            return this.generateValidatorKey().then((data) => {
              return fs.writeFile(
                this.heimdallValidatorKeyFilePath,
                JSON.stringify(data, null, 2),
                { mode: 0o755 }
              )
            })
          }
        },
        {
          title: 'Process genesis file',
          task: () => {
            return this.getProcessGenesisFileTasks()
          }
        },
        {
          title: 'Process heimdall app config file',
          task: () => {
            fileReplacer(this.heimdallAppConfigFilePath)
              .replace(
                /eth_rpc_url[ ]*=[ ]*".*"/gi,
                'eth_rpc_url = "http://localhost:9545"'
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
              .save()
          }
        },
        {
          title: 'Process heimdall config file',
          task: () => {
            fileReplacer(this.heimdallConfigFilePath)
              .replace(
                /laddr[ ]*=[ ]*"tcp:\/\/127\.0\.0\.1:26657"/gi,
                'laddr = "tcp://0.0.0.0:26657"'
              )
              .save()
          }
        },
        {
          title: 'Copy template scripts',
          task: async () => {
            const templateDir = path.resolve(
              new URL(import.meta.url).pathname,
              '../templates'
            )

            // copy all templates to target directory
            await fs.copy(templateDir, this.config.targetDirectory)

            // process all njk templates
            await processTemplateFiles(this.config.targetDirectory, {
              obj: this
            })
          }
        }
      ],
      {
        exitOnError: true
      }
    )
  }
}

async function setupHeimdall(config) {
  const anvil = new Anvil(config, {
    contractsBranch: config.contractsBranch
  })
  const heimdall = new Heimdall(config, {
    repositoryUrl: config.heimdallRepo,
    repositoryBranch: config.heimdallBranch,
    dockerContext: config.heimdallDockerBuildContext
  })

  // get all heimdall related tasks
  const tasks = new Listr(
    [
      {
        title: anvil.taskTitle,
        task: () => {
          return anvil.getTasks()
        }
      },
      {
        title: heimdall.taskTitle,
        task: () => {
          return heimdall.getTasks()
        }
      }
    ],
    {
      exitOnError: true
    }
  )

  await tasks.run()
  console.log('%s Heimdall is ready', chalk.green.bold('DONE'))

  // print details
  await config.print()
  await anvil.print()
  await heimdall.print()

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
  await config.loadAccounts()

  // load branch
  const answers = await getDefaultBranch(config)
  config.set(answers)

  // start setup
  await setupHeimdall(config)
}
