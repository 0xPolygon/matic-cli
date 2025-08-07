// noinspection JSUnresolvedFunction,JSUnresolvedVariable

import { Listr } from 'listr2'
import execa from 'execa'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'

import { loadConfig } from '../config.js'
import { cloneRepository, getKeystoreFile } from '../../lib/utils.js'
import { getDefaultBranch } from '../helper.js'
import { Genesis } from '../genesis/index.js'
import { getRemoteStdio } from '../../express/common/remote-worker.js'

// default password
export const KEYSTORE_PASSWORD = 'hello'

//
// Erigon setup class
//

export class Erigon {
  constructor(config, options = {}) {
    this.config = config

    this.repositoryName = 'erigon'
    this.repositoryBranch = options.repositoryBranch || 'main'
    this.repositoryUrl =
      options.repositoryUrl || 'https://github.com/erigontech/erigon'

    this.genesis = new Genesis(config)
  }

  get name() {
    return 'erigon'
  }

  get taskTitle() {
    return 'Setup Erigon'
  }

  get repositoryDir() {
    return path.join(this.config.codeDir, this.repositoryName)
  }

  get buildDir() {
    return path.join(this.repositoryDir, 'build')
  }

  get erigonDataDir() {
    return path.join(this.config.dataDir, 'erigon')
  }

  get keystoreDir() {
    return path.join(this.config.dataDir, 'keystore')
  }

  get passwordFilePath() {
    return path.join(this.config.dataDir, 'password.txt')
  }

  get keystorePassword() {
    return this.config.keystorePassword || KEYSTORE_PASSWORD
  }

  async print() {
    console.log(
      chalk.gray('Erigon data') + ': ' + chalk.bold.green(this.borDataDir)
    )
    console.log(
      chalk.gray('Erigon repo') + ': ' + chalk.bold.green(this.repositoryDir)
    )
  }

  async cloneRepositoryAndProcessTemplates() {
    return new Listr(
      [
        {
          title: 'Clone Erigon repository',
          task: () =>
            cloneRepository(
              this.repositoryName,
              this.repositoryBranch,
              this.repositoryUrl,
              this.config.codeDir
            )
        },
        {
          title: 'Prepare data directory',
          task: () => {
            return execa(
              'mkdir',
              ['-p', this.config.dataDir, this.erigonDataDir, this.keystoreDir],
              {
                cwd: this.config.targetDirectory,
                stdio: getRemoteStdio()
              }
            )
          }
        }
      ],
      {
        concurrent: true
      }
    )
  }

  async getTasks() {
    const setupTask = await this.cloneRepositoryAndProcessTemplates()
    await setupTask.run()
    return new Listr(
      [
        {
          title: 'Build Erigon',
          task: () =>
            execa('make', ['erigon'], {
              cwd: this.repositoryDir,
              stdio: getRemoteStdio()
            })
        },
        {
          title: 'Prepare keystore and password.txt',
          task: () => {
            if (this.config.devnetType === 'remote') {
              return
            }
            // get keystore file and store in keystore file
            const keystoreFileObj = getKeystoreFile(
              this.config.primaryAccount.privateKey,
              this.config.keystorePassword
            )

            // resolve promise
            return fs.emptyDir(this.keystoreDir).then(() => {
              const p = [
                fs.writeFile(
                  this.passwordFilePath,
                  `${this.config.keystorePassword}\n`
                ),
                fs.writeFile(
                  path.join(this.keystoreDir, keystoreFileObj.keystoreFilename),
                  JSON.stringify(keystoreFileObj.keystore, null, 2)
                )
              ]
              return Promise.all(p)
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

async function setupErigon(config) {
  const erigon = new Erigon(config)

  const tasks = new Listr(
    [
      {
        title: erigon.genesis.taskTitle,
        task: () => {
          return erigon.genesis.getTasks()
        }
      },
      {
        title: erigon.taskTitle,
        task: () => {
          return erigon.getTasks()
        }
      }
    ],
    {
      exitOnError: true
    }
  )

  await tasks.run()
  console.log('%s Erion is ready', chalk.green.bold('DONE'))

  // print config
  await config.print()
  await erigon.genesis.print(config)
  await erigon.print()

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
  await setupErigon(config)
}
