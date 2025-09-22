## Backfill State Sync Tx Tools

### Debug Methods

"<BOR_DATADIR>" must be the same one set on the bor's config as datadir.

1. debug-read-key
   Input

```
./bin/backfill-state-sync-txs debug-read-key --data-path "<BOR_DATADIR>" --key 0x6d617469632d626f722d74782d6c6f6f6b75702da51758acfc662beb5e297f78210ddf2b4026b83bd4f154850dba4cabf610eded
```

2. debug-delete-key
   Input

```
./bin/backfill-state-sync-txs debug-delete-key --data-path "<BOR_DATADIR>" --key 0x6d617469632d626f722d74782d6c6f6f6b75702da51758acfc662beb5e297f78210ddf2b4026b83bd4f154850dba4cabf610eded
```

3. debug-write-key

Input

```
./bin/backfill-state-sync-txs debug-write-key --data-path "<BOR_DATADIR>" --key 0x6d617469632d626f722d74782d6c6f6f6b75702da51758acfc662beb5e297f78210ddf2b4026b83bd4f154850dba4cabf610eded --value 0x000000000000000000000000000000000000000000000000000000000000000000000000
```

4. debug-encode-bor-receipt-key

Input

```
./bin/backfill-state-sync-txs debug-encode-bor-receipt-key --number 74667488 --hash 0x38623e33fa0f94dd9276b7d44ea589608085b56c8fc87950612562b09e18b896
```

5. debug-encode-bor-tx-lookup-entry

Input

```
./bin/backfill-state-sync-txs debug-encode-bor-tx-lookup-entry --hash 0xc048ab4888a7d0c044b85e3371b775efbeb7a7b9d93a1d229ee1b039150c3289
```

6. debug-encode-bor-receipt-value

Input

```
./bin/backfill-state-sync-txs debug-encode-bor-receipt-value --hash 0x38623e33fa0f94dd9276b7d44ea589608085b56c8fc87950612562b09e18b896 --remote-rpc localhost:8545
```

7. write-missing-state-sync-tx

Input

```
./bin/backfill-state-sync-txs write-missing-state-sync-tx --data-path "<BOR_DATADIR>" --state-missing-transactions-file "./dump_instructions.json"
```

8. find-all-state-sync-tx
   Input

```
./bin/backfill-state-sync-txs find-all-state-sync-tx --start-block "<START_BLOCK>" --end-block "<END_BLOCK>" --interval "<INTERVAL>" --remote-rpc "<REMOTE_RPC_URL>" --output-file "<OUTPUT_FILE>"
```
