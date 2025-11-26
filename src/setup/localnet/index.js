// noinspection JSUnresolvedVariable

import { Listr } from 'listr2'
import chalk from 'chalk'
import path from 'path'
import fs from 'fs-extra'

import { getDefaultBranch } from '../helper.js'
import { loadConfig } from '../config.js'

import { Genesis } from '../genesis/index.js'
import { Heimdall } from '../heimdall/index.js'
import { Anvil } from '../anvil/index.js'
import { Bor } from '../bor/index.js'
import { processTemplateFiles } from '../../lib/utils.js'

async function setupLocalnet(config) {
  const anvil = new Anvil(config, {
    contractsBranch: config.contractsBranch
  })
  const bor = new Bor(config, {
    repositoryUrl: config.borRepo || 'https://github.com/0xPolygon/bor',
    repositoryBranch: config.borBranch || 'develop'
  })
  const heimdall = new Heimdall(config, {
    repositoryUrl:
      config.heimdallRepo || 'https://github.com/0xPolygon/heimdall-v2',
    repositoryBranch: config.heimdallBranch || 'develop'
  })
  const genesis = new Genesis(config, {
    repositoryUrl:
      config.genesisContractsRepo ||
      'https://github.com/0xPolygon/genesis-contracts',
    repositoryBranch: config.genesisContractsBranch || 'master'
  })

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
      },
      {
        title: genesis.taskTitle,
        task: () => {
          return genesis.getTasks()
        }
      },
      {
        title: bor.taskTitle,
        task: () => {
          return bor.getTasks()
        }
      },
      {
        title: 'Process scripts',
        task: async () => {
          const templateDir = path.resolve(
            new URL(import.meta.url).pathname,
            '../templates'
          )

          // copy all templates to target directory
          await fs.copy(templateDir, config.targetDirectory)

          // process all njk templates
          await processTemplateFiles(config.targetDirectory, { obj: this })
        }
      }
    ],
    {
      exitOnError: true
    }
  )

  await tasks.run()
  console.log('%s Localnet ready', chalk.green.bold('DONE'))

  // print details
  await config.print()

  await genesis.print()
  await heimdall.print()
  await genesis.print()
  await bor.print()
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
  await setupLocalnet(config)
}
