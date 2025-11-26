# Devnet scripts

### Run multiple heimdall nodes

```bash
# start heimdall0
$ docker compose up -d heimdall0

# exec bash into heimdall0
$ docker exec -i -t heimdall0 bash
```

**To access bash for all nodes**

```bash
$ tmux
$ bash tmux-docker.sh
```

**To read logs**

On docker container's shell:

```bash
$ tail -f /heimdall/logs/heimdalld.log
```

**To retrieve nodes and contracts addresses**

After starting bor nodes, you can retrieve the public and private keys of the node.

```bash
# example with the first node (node0).
$ cat devnet/devnet/node0/bor/address.txt
0x2Bd3C50030325a0587f6c9AE3d3Aa5C2b14b72E6

$ cat devnet/devnet/node0/bor/privatekey.txt
0x2bf046c818b06eca93f25dcb08ff89658bd1acd54c43d6e1fffe78c9332fd50a
```

After starting the chains and deploying contracts on the child chain, you can retrieve the contract addresses.

```bash
$ cat devnet/code/pos-contracts/contractAddresses.json
{
  "root": {
    "Registry": "0xB39aA4E9646Fd9C50ee8C871Fe345569C4D5D04A",
    "RootChain": "0x67D07acbA0389ECF514eF8B43dFE4D8f6dDBB5d2",
    "GovernanceProxy": "0x0e63099e1420C7a3BF8C226730eEDc6C2d1A1704",
    "RootChainProxy": "0xBa1F4D93D62c24dAE67c33F9Cd1bECaa2d46dD5B",
    "DepositManager": "0x5Bc2B859D594e136A0552e7BDF2dF3867424Cce7",
    "DepositManagerProxy": "0x4A356C9CAeDfefE43c144419487e06c04296bf69",
    "WithdrawManager": "0x765fd35DBbDff1dd36e422C76Fa37a6F55A4687d",
    "WithdrawManagerProxy": "0x50415F3215599Bd6B92bA68cea61b46A15022F59",
    "StakeManager": "0x09F8d80E3d162CD8CBbD494633b9D3eD75bDF36e",
    "StakeManagerProxy": "0x9Db18c0C0384c2986F70e8B109a564129599Ce23",
    "SlashingManager": "0xF67b5A1A85b4e50F594d450dB2a2f2FCfD24DEF0",
    "StakingInfo": "0xcC589091De6aE35b53dF660A347c3887E6C94461",
    "ExitNFT": "0x29A4a587c0642B1234b2918Fb37Ca06270D1a1CF",
    "StateSender": "0xF88d3899fD32f0531E100d258160738145379E14",
    "predicates": {
      "ERC20Predicate": "0x25405947a3bD2BD7767C2Cf8124F315883fD7111",
      "ERC721Predicate": "0xBe710e1C3F7F4c7E295A4686d1d6478512238EA4",
      "MarketplacePredicate": "0xe3c38Ab717c4e489C602196Cc2902F7AfeD3765D",
      "TransferWithSigPredicate": "0x497506B0Be50dcD034b03D6565fc0A39EC513092"
    },
    "tokens": {
      "MaticToken": "0x4b7FF52bbe91CF6A743D428D84F38162ea3a1310",
      "MaticWeth": "0xc888E865D9067E2c44672Fa50bE2B77a781528EC",
      "TestToken": "0x2DDAB92De80d1D9D7e89fA49429F88d47d7222Bc",
      "RootERC721": "0xe80F298C455A5aD3EbB8B6ab602A336a43C958A7"
    }
  },
  "child": {
    "ChildChain": "0x680C2C3f42213FA92868b80E0aCb6430850186CE",
    "tokens": {
      "MaticWeth": "0xd30123F2B51a9C043755cAF07a833124933B1edb",
      "MaticToken": "0x0000000000000000000000000000000000001010",
      "TestToken": "0xe249c8135a138fF48C8b79Ef7ABe8c0C902cC298",
      "RootERC721": "0x43e5D5380B8D5FA8aA1fe67D0C3F33D5B0FcE26b"
    }
  }
}
```

### Run multiple bor nodes

```bash
# setup all nodes
$ bash docker-bor-setup.sh

# start node
$ bash docker-bor-start.sh 0 # for node 0

# start all nodes at once
$ bash docker-bor-start-all.sh
```

### Clean Heimdall/Bor data and start fresh

```bash
$ bash docker-clean.sh
```
