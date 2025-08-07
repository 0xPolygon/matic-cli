# Configurations

`express-cli` and `matic-cli` use these config files to bootstrap the devnet.
In case of `express-cli`, these configs are dynamically changes based on the `.env` file.
For `mati-cli`, the configs are directly used to spin the network up.

## Usage

```bash
matic-cli setup devnet --config path/to/config.yaml | tee setup.log
```

## Option details with examples

```yaml
# Default stake for each validator (in matic)
defaultStake: 10000

# Default amount of fee to topup heimdall validator
defaultFee: 2000

# ChainID of bor (leave empty to get a random one)
borChainId:

# ChainID of heimdall (leave empty to get a random one)
heimdallChainId:

# Sprint size (number of blocks for each bor sprint)
sprintSize:

# Block numbers (comma separated values defining the block heights of bor where sprint size must change)
sprintSizeBlockNumber:

# Block numbers (comma separated values defining the block heights of bor where block time must change)
blockNumber:

# Block times (comma separated values defining the block times for the relative blockNumber(s))
blockTime:

# Number of validators to create
numOfValidators: 2

# Number of non-validators (sentry nodes) to create
numOfNonValidators: 0

# Devnet type, choose from [docker, remote]
devnetType: remote

# URL to Ethereum RPC
ethURL: http://anvil:9545

# Remote user for Ethereum RPC. Only effective when devnetType is `remote`.
ethHostUser: ubuntu

# IPs of hosts where bor will run. Only effective when devnetType is `remote`.
devnetBorHosts:
  - 172.20.1.100
  - 172.20.1.101

# IPs of hosts where heimdall will run. Only effective when devnetType is `remote`. It's recommended to run bor and heimdall on same VMs, hence devnetBorHosts===devnetHeimdallHosts
devnetHeimdallHosts:
  - 172.20.1.100
  - 172.20.1.101

# Users of hosts where bor will run. Only effective when devnetType is `remote`.
devnetBorUsers:
  - ubuntu
  - ubuntu

# Users where heimdall will run. Only effective when devnetType is `remote`.
devnetHeimdallUsers:
  - ubuntu
  - ubuntu

# Branch of bor to use. Repository: https://github.com/0xPolygon/bor
borBranch: develop

# Branch of Heimdall to use. Repository: https://github.com/0xPolygon/heimdall-v2
heimdallBranch: develop

# Branch of contract to use. Repository: https://github.com/0xPolygon/pos-contracts
contractsBranch: anvil-pos

# Branch of contract to use. Repository: https://github.com/0xPolygon/genesis-contracts
genesisContractsBranch: master

# Docker build context for bor. Used in docker setup. When specified, borBranch will be ignored.
borDockerBuildContext: 'https://github.com/0xPolygon/bor.git#develop'

# Docker build context for heimdall. Used in docker setup. When specified, heimdallBranch will be ignored.
heimdallDockerBuildContext: 'https://github.com/0xPolygon/heimdall-v2.git#develop'

# Datadog api key required to setup datadog traces and metrics for the node.
DD_API_KEY: <DATADOG API KEY> # Datadog API key
```
