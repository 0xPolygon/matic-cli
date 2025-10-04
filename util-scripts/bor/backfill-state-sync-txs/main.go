package main

import (
	"flag"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Expected a subcommand: 'find-all-state-sync-tx', 'write-missing-state-sync-tx', 'debug-delete-key', 'debug-read-key', 'debug-write-key','debug-encode-bor-receipt-key', 'debug-check-all-state-sync-tx', or 'debug-encode-bor-tx-lookup-entry'.")
		os.Exit(1)
	}

	switch os.Args[1] {
	case "find-all-state-sync-tx":
		findCmd := flag.NewFlagSet("find-all-state-sync-tx", flag.ExitOnError)
		startBlock := findCmd.Uint64("start-block", 0, "Start block number")
		endBlock := findCmd.Uint64("end-block", 0, "End block number")
		interval := findCmd.Uint64("interval", 0, "Block Interval for queries")
		batchSize := findCmd.Uint64("batch-size", 0, "RPC Batch size for receipt retrieval")
		concurrency := findCmd.Uint64("concurrency", 1, "Concurrency limit")
		remoteRPC := findCmd.String("remote-rpc", "", "Source-of-truth RPC URL")
		outputFile := findCmd.String("output-file", "", "Path to output file")
		findCmd.Parse(os.Args[2:])

		if *remoteRPC == "" || *outputFile == "" {
			findCmd.Usage()
			os.Exit(1)
		}
		FindAllStateSyncTransactions(*startBlock, *endBlock, *interval, *batchSize, *concurrency, *remoteRPC, *outputFile)

	case "write-missing-state-sync-tx":
		writeCmd := flag.NewFlagSet("write-missing-state-sync-tx", flag.ExitOnError)
		dataPath := writeCmd.String("data-path", "", "Path to data directory")
		txFile := writeCmd.String("state-missing-transactions-file", "", "File containing missing transactions")
		writeCmd.Parse(os.Args[2:])

		if *dataPath == "" || *txFile == "" {
			writeCmd.Usage()
			os.Exit(1)
		}
		WriteMissingStateSyncTransactions(*dataPath, *txFile)

	case "debug-delete-key":
		delCmd := flag.NewFlagSet("debug-delete-key", flag.ExitOnError)
		dataPath := delCmd.String("data-path", "", "Path to data directory")
		key := delCmd.String("key", "", "Hex-encoded key")
		delCmd.Parse(os.Args[2:])

		if *dataPath == "" || *key == "" {
			delCmd.Usage()
			os.Exit(1)
		}
		DebugDeleteKey(*dataPath, *key)

	case "debug-read-key":
		readCmd := flag.NewFlagSet("debug-read-key", flag.ExitOnError)
		dataPath := readCmd.String("data-path", "", "Path to data directory")
		key := readCmd.String("key", "", "Hex-encoded key")
		readCmd.Parse(os.Args[2:])

		if *dataPath == "" || *key == "" {
			readCmd.Usage()
			os.Exit(1)
		}
		DebugReadKey(*dataPath, *key)

	case "debug-write-key":
		writeCmd := flag.NewFlagSet("debug-write-key", flag.ExitOnError)
		dataPath := writeCmd.String("data-path", "", "Path to data directory")
		key := writeCmd.String("key", "", "Hex-encoded key")
		value := writeCmd.String("value", "", "Hex-encoded value")
		writeCmd.Parse(os.Args[2:])

		if *dataPath == "" || *key == "" || *value == "" {
			writeCmd.Usage()
			os.Exit(1)
		}
		DebugWriteKey(*dataPath, []WriteInstruction{{Key: *key, Value: *value}})

	case "debug-encode-bor-receipt-key":
		recCmd := flag.NewFlagSet("debug-encode-bor-receipt-key", flag.ExitOnError)
		number := recCmd.Uint64("number", 0, "Block number")
		hash := recCmd.String("hash", "", "Block hash")
		recCmd.Parse(os.Args[2:])

		if *hash == "" {
			recCmd.Usage()
			os.Exit(1)
		}
		DebugEncodeBorReceiptKey(*number, *hash, true)

	case "debug-encode-bor-tx-lookup-entry":
		txCmd := flag.NewFlagSet("debug-encode-bor-tx-lookup-entry", flag.ExitOnError)
		hash := txCmd.String("hash", "", "Transaction hash")
		txCmd.Parse(os.Args[2:])

		if *hash == "" {
			txCmd.Usage()
			os.Exit(1)
		}
		DebugEncodeBorTxLookupEntry(*hash, true)

	case "debug-encode-bor-receipt-value":
		receiptValueCmd := flag.NewFlagSet("debug-encode-bor-receipt-value", flag.ExitOnError)
		hash := receiptValueCmd.String("hash", "", "Transaction hash")
		remoteRPC := receiptValueCmd.String("remote-rpc", "", "RPC Server")
		receiptValueCmd.Parse(os.Args[2:])

		if *hash == "" {
			receiptValueCmd.Usage()
			os.Exit(1)
		}
		DebugEncodeBorReceiptValue(*hash, *remoteRPC, true)

	case "debug-check-all-state-sync-tx":
		checkAllStateSyncCmd := flag.NewFlagSet("debug-check-all-state-sync-tx", flag.ExitOnError)
		startBlock := checkAllStateSyncCmd.Uint64("start-block", 0, "Start block number")
		endBlock := checkAllStateSyncCmd.Uint64("end-block", 0, "End block number")
		interval := checkAllStateSyncCmd.Uint64("interval", 0, "Block Interval for queries")
		concurrency := checkAllStateSyncCmd.Uint64("concurrency", 1, "Concurrency calls")
		remoteRPC := checkAllStateSyncCmd.String("remote-rpc", "", "Source-of-truth RPC URL")
		checkAllStateSyncCmd.Parse(os.Args[2:])

		if *remoteRPC == "" {
			checkAllStateSyncCmd.Usage()
			os.Exit(1)
		}
		CheckAllStateSyncTxs(*startBlock, *endBlock, *interval, *concurrency, *remoteRPC)

	default:
		fmt.Printf("Unknown subcommand: %s\n", os.Args[1])
		os.Exit(1)
	}
}
