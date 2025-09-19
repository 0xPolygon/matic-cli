# 🛠️ Bor Calculators

## 🔍 What's Inside

| Script                  | Description                                                                                                                                                           |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `avg_blocktime/main.go` | Calculates the average block time over the last 40k, 280k, 560k, and 1.12M blocks on the Bor chain. Useful for chain health monitoring and block production analysis. |
| `hf_block/main.go`      | Predicts the block height corresponding to a future target UTC time given an assumed average block time for the Bor chain (e.g. planning for hard forks or upgrades). |

---

## 🚀 Quick Start

### Example 1: Calculate Bor Average Block Times

```bash
cd avg_blocktime
go run main.go
# OR
go run main.go [-rpc=<RPC_URL>]
# Example:
go run main.go -rpc="https://polygon-rpc.com"
```

This script

- Fetches the latest block height and timestamp from Bor RPC
- For each lookback (40k, 280k, 560k, 1.12M blocks), fetches a past block
- Prints elapsed time (days/hours/minutes/seconds) and average block time in seconds

### Example 2: Predict Bor Block Height at a Future Time

```bash
cd hf_block
go run main.go -target=<TIMESTAMP> -avg="AVG_SECONDS" [-rpc=<POLYGON_RPC_URL>] 
# Example:
go run main.go-target="2025-10-07T14:00:00Z" -avg=2.156
```

This script

- Fetches the latest block height and timestamp from Bor RPC
- Uses a configurable target UTC timestamp and average block time
- Calculates how many blocks fit in the delta between now and target
- Prints the predicted block height and time delta
