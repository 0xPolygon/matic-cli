# 🛠️ Heimdall Calculators

## 🔍 What's Inside

| Script                  | Description                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `avg_blocktime/main.go` | Calculates the average block time over the last 10k, 100k, 1M, and 1.5M blocks. Useful for chain health monitoring and block production analysis.   |
| `hf_block/main.go`      | Predicts the block height corresponding to a future target UTC time given an assumed average block time (e.g. planning for hard forks or upgrades). |

---

## 🚀 Quick Start

### Example 1: Calculate Heimdall Average Block Times

```bash
cd avg_blocktime
go run main.go
```

This script

- Fetches the latest block height and timestamp from Heimdall APIs
- For each lookback (10k, 100k, 1M, 1.5M blocks), fetches a past block
- Prints elapsed time (days/hours/minutes/seconds) and average block time in seconds

### Example 2: Predict Heimdall Block Height at a Future Time

```bash
cd hf_block
go run main.go -target=<TIMESTAMP> -avg="AVG_SECONDS" [-url=<COMET_BASE_URL>]
# Example:
go run main.go -target="2025-10-07T14:00:00Z" -avg=1.6
```

This script

- Fetches the latest block height and timestamp from Heimdall APIs
- Uses a hardcoded target UTC timestamp and an average block time (in seconds)
- Calculates how many blocks fit in the delta between now and target
- Prints the predicted block height and time delta
