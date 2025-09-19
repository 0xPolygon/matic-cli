package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"context"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/rlp"
	"github.com/ethereum/go-ethereum/rpc"

	"github.com/ethereum/go-ethereum/common"
)

/*

This script gets all the blocks in which state sync txns are present on Matic pos mainnnet chain from polygonscan. It then checks if there are any difference between the no of txns in these blocks on local node vs remote rpc url and reports such occurrences.

Mainnet API for getting all state sync txs:
https://api.polygonscan.com/api?module=account&action=txlist&address=0x0000000000000000000000000000000000000000&startblock=1&endblock=99999999&page=1&offset=1000&sort=asc&apikey=YourApiKeyToken


https://api.polygonscan.com/api?module=account&action=txlist&address=0x0000000000000000000000000000000000000000&startblock=1&endblock=1000&page=1&offset=1000&sort=asc



1. Get all state sync txs in a block range from polygonscan
2. For these txs, check if we have these txs in our localhost bor rpc
3. If no, append output to a file

*/

type PolygonScanResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Result  []struct {
		BlockNumber       string `json:"blockNumber"`
		TimeStamp         string `json:"timeStamp"`
		Hash              string `json:"hash"`
		Nonce             string `json:"nonce"`
		BlockHash         string `json:"blockHash"`
		TransactionIndex  string `json:"transactionIndex"`
		From              string `json:"from"`
		To                string `json:"to"`
		Value             string `json:"value"`
		Gas               string `json:"gas"`
		GasPrice          string `json:"gasPrice"`
		IsError           string `json:"isError"`
		TxreceiptStatus   string `json:"txreceipt_status"`
		Input             string `json:"input"`
		ContractAddress   string `json:"contractAddress"`
		CumulativeGasUsed string `json:"cumulativeGasUsed"`
		GasUsed           string `json:"gasUsed"`
		Confirmations     string `json:"confirmations"`
	} `json:"result"`
}

type Tx struct {
	BlockNumber uint64
	BlockHash   string
	Hash        string
	StateSyncId string
}

type TxResponse struct {
	Jsonrpc string            `json:"jsonrpc"`
	ID      int               `json:"id"`
	Result  *TxResponseResult `json:"result"`
}

type TxResponseResult struct {
	BlockHash        string `json:"blockHash"`
	BlockNumber      string `json:"blockNumber"`
	From             string `json:"from"`
	Gas              string `json:"gas"`
	GasPrice         string `json:"gasPrice"`
	Hash             string `json:"hash"`
	Input            string `json:"input"`
	Nonce            string `json:"nonce"`
	To               string `json:"to"`
	TransactionIndex string `json:"transactionIndex"`
	Value            string `json:"value"`
	Type             string `json:"type"`
	V                string `json:"v"`
	R                string `json:"r"`
	S                string `json:"s"`
}

type WriteInstruction struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

var psCount int
var missingTxs int

func getStateSyncTxns(start, end int, remoteRPCUrl string) []Tx {
	var txs []Tx
	ctx := context.Background()
	// Connect to the RPC server
	client, err := rpc.DialContext(ctx, remoteRPCUrl)
	if err != nil {
		fmt.Errorf("failed to connect to RPC %s: %w", remoteRPCUrl, err)
		return nil
	}
	defer client.Close()

	// Build filter object for eth_getLogs
	filter := map[string]interface{}{
		"fromBlock": hexutil.Uint64(start),
		"toBlock":   hexutil.Uint64(end),
		"address":   common.HexToAddress("0x0000000000000000000000000000000000001001"),
		"topics":    [][]common.Hash{{common.HexToHash("0x5a22725590b0a51c923940223f7458512164b1113359a735e86e7f27f44791ee")}},
	}

	// Call eth_getLogs
	var logs []types.Log
	if err := client.CallContext(ctx, &logs, "eth_getLogs", filter); err != nil {
		fmt.Errorf("failed to get logs: %w", err)
		return nil
	}

	// fmt.Println(PrettyPrint(result))

	fmt.Printf("Got records: %d  on range(%d, %d)\n", len(logs), start, end)
	for _, log := range logs {
		txs = append(txs, Tx{BlockNumber: log.BlockNumber, Hash: log.TxHash.Hex(), BlockHash: log.BlockHash.Hex(), StateSyncId: log.Topics[1].Hex()})
		psCount += 1
	}
	return txs
}

func PrettyPrint(i interface{}) string {
	s, _ := json.MarshalIndent(i, "", "\t")
	return string(s)
}

func FindAllStateSyncTransactions(startBlock, endBlock, interval, concurrency uint64, remoteRPCUrl, outputFile string) {
	var writeInstructions []WriteInstruction

	file, err := os.OpenFile(outputFile, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0o755)
	if err != nil {
		log.Fatalf("failed to open output file: %v", err)
	}
	defer file.Close()

	results, err := CheckAllStateSyncTxs(startBlock, endBlock, interval, concurrency, remoteRPCUrl)
	if err != nil {
		log.Fatalf("error on interval: %v", err)
	}

	// Dedup txs and build lookup entries (no RPC needed)
	txInserted := make(map[string]struct{}, len(results))
	unique := make([]Tx, 0, len(results))
	for _, tx := range results {
		if _, ok := txInserted[tx.Hash]; ok {
			continue
		}
		txInserted[tx.Hash] = struct{}{}
		unique = append(unique, tx)

		lookupKey := DebugEncodeBorTxLookupEntry(tx.Hash, false)
		lookupValue := fmt.Sprintf("0x%s", common.Bytes2Hex(big.NewInt(0).SetUint64(tx.BlockNumber).Bytes()))
		writeInstructions = append(writeInstructions, WriteInstruction{Key: lookupKey, Value: lookupValue})
	}

	// Single RPC client reused across all batches/workers
	ctx := context.Background()
	client, err := rpc.DialContext(ctx, remoteRPCUrl)
	if err != nil {
		log.Fatalf("failed to connect to RPC %s: %v", remoteRPCUrl, err)
	}
	defer client.Close()

	// Tune these knobs if needed
	const defaultBatchSize = 100 // many providers accept 50–1000; 100 is a safe start
	batchSize := defaultBatchSize
	if batchSize <= 0 {
		batchSize = 100
	}
	// reuse the incoming concurrency param for workers
	workerCount := int(concurrency)
	if workerCount <= 0 {
		workerCount = 8
	}

	// Batched + concurrent receipt fetch+encode
	receiptWIs, err := batchedReceipts(ctx, client, unique, batchSize, workerCount, false)
	if err != nil {
		// non-fatal in case some receipts succeeded; choose fatal if you prefer strictness
		log.Printf("warnings during batched receipts: %v", err)
	}

	// Merge: lookups (already added) + receipt write instructions
	writeInstructions = append(writeInstructions, receiptWIs...)

	fmt.Println("Total no of records: ", len(writeInstructions))
	fmt.Println()

	b, err := json.MarshalIndent(writeInstructions, "", "    ")
	if err != nil {
		log.Fatalf("json.MarshalIndent failed: %v", err)
	}
	if _, err := file.Write(b); err != nil {
		log.Fatalf("failed writing output: %v", err)
	}
	fmt.Println("Data Successfully written: ", outputFile)
}

// batchedReceipts fetches receipts for txs in batches, concurrently.
func batchedReceipts(
	ctx context.Context,
	client *rpc.Client,
	txs []Tx,
	batchSize int,
	concurrency int,
	shouldPrint bool,
) ([]WriteInstruction, error) {

	type job struct {
		chunk []Tx
	}
	jobs := make(chan job, concurrency*2)
	out := make(chan []WriteInstruction, concurrency*2)
	errs := make(chan error, concurrency)

	chunks := chunkTxs(txs, batchSize)
	totalJobs := len(chunks)

	worker := func() {
		defer func() {
			// drain panics
			if r := recover(); r != nil {
				errs <- fmt.Errorf("worker panic: %v", r)
			}
		}()

		for j := range jobs {
			chunk := j.chunk
			elems := make([]rpc.BatchElem, len(chunk))
			results := make([]*ReceiptJustLogs, len(chunk))

			for i, tx := range chunk {
				// normalize hash (remove 0x if present)
				h := strings.TrimPrefix(tx.Hash, "0x")
				txHash := common.HexToHash(h)
				results[i] = &ReceiptJustLogs{}

				elems[i] = rpc.BatchElem{
					Method: "eth_getTransactionReceipt",
					Args:   []interface{}{txHash},
					Result: results[i],
				}
			}

			// Do one batched call for the chunk
			callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			err := client.BatchCallContext(callCtx, elems)
			cancel()
			if err != nil {
				errs <- fmt.Errorf("batch call failed (%d items): %w", len(chunk), err)
				continue
			}

			// Build write instructions for every successful element
			var wi []WriteInstruction
			for i, el := range elems {
				tx := chunk[i]
				if el.Error != nil {
					// upstream might rate-limit or skip unknown receipt; skip but report
					errs <- fmt.Errorf("receipt error for %s: %v", tx.Hash, el.Error)
					continue
				}
				// Result is already unmarshaled into results[i]
				rjl := results[i]
				if rjl == nil || rjl.Logs == nil {
					// missing/unknown receipt; skip
					continue
				}

				// Encode as Bor receipt value (Status forced to successful)
				bytes, encErr := rlp.EncodeToBytes(&types.ReceiptForStorage{
					Status: types.ReceiptStatusSuccessful,
					Logs:   rjl.Logs,
				})
				if encErr != nil {
					errs <- fmt.Errorf("RLP encode failed for %s: %v", tx.Hash, encErr)
					continue
				}

				receiptKey := DebugEncodeBorReceiptKey(tx.BlockNumber, tx.BlockHash, false)
				receiptValue := fmt.Sprintf("0x%s", common.Bytes2Hex(bytes))
				wi = append(wi, WriteInstruction{Key: receiptKey, Value: receiptValue})

				if shouldPrint {
					fmt.Printf("tx %s -> %d logs\n", tx.Hash, len(rjl.Logs))
				}
			}
			out <- wi
		}
	}

	// start workers
	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			worker()
		}()
	}

	// feed jobs
	go func() {
		defer close(jobs)
		for _, c := range chunks {
			jobs <- job{chunk: c}
		}
	}()

	// close out when workers finish
	go func() {
		wg.Wait()
		close(out)
		close(errs)
	}()

	// collect results; aggregate errors but don’t fail hard unless you want to
	var all []WriteInstruction
	var firstErr error
	var completed int64
	start := time.Now()

	for out != nil || errs != nil {
		select {
		case wi, ok := <-out:
			if !ok {
				out = nil
				continue
			}
			all = append(all, wi...)
			// --- progress + ETA ---
			done := atomic.AddInt64(&completed, 1)
			elapsed := time.Since(start)
			remaining := totalJobs - int(done)

			var eta time.Duration
			if done > 0 && remaining > 0 {
				avgPer := elapsed / time.Duration(done)
				eta = time.Duration(remaining) * avgPer
			}

			pct := float64(done) / float64(totalJobs) * 100
			log.Printf("progress: %d/%d (%.1f%%), eta: %s",
				done, totalJobs, pct, formatETA(eta))

		case e, ok := <-errs:
			if !ok {
				errs = nil
				continue
			}
			// keep the first error to surface; others just log
			if firstErr == nil {
				firstErr = e
			} else {
				log.Printf("batch worker error: %v", e)
			}
		}
	}
	return all, firstErr
}

// split into a matrix first so we can know totalJobs
func chunkTxs(txs []Tx, batchSize int) [][]Tx {
	if batchSize <= 0 {
		batchSize = 100
	}
	n := len(txs)
	if n == 0 {
		return nil
	}
	chunks := make([][]Tx, 0, (n+batchSize-1)/batchSize)
	for i := 0; i < n; i += batchSize {
		end := i + batchSize
		if end > n {
			end = n
		}
		chunks = append(chunks, txs[i:end])
	}
	return chunks
}

// Add this near your other types.
type MissedInterval struct {
	Start, End           uint64 // missing range [Start..End]
	PrevID, NextID       uint64 // the neighbors we DID see
	PrevBlock, NextBlock uint64 // blocks of those neighbors
}

// Pretty-printer for the intervals.
func printMissedIntervals(intervals []MissedInterval) {
	// Count total missing ids.
	var total uint64
	for _, m := range intervals {
		total += (m.End - m.Start + 1)
	}

	if len(intervals) == 0 {
		fmt.Println("Missed State Syncs: none ✅")
		return
	}

	fmt.Printf("Missed State Syncs: %d id(s) across %d interval(s)\n\n", total, len(intervals))
	for _, m := range intervals {
		if m.Start == m.End {
			// Single missing id
			fmt.Printf("#%d (prev: #%d @ block %d, next: #%d @ block %d)\n",
				m.Start, m.PrevID, m.PrevBlock, m.NextID, m.NextBlock)
		} else {
			// Range
			fmt.Printf("%d–%d (prev: #%d @ block %d, next: #%d @ block %d)\n",
				m.Start, m.End, m.PrevID, m.PrevBlock, m.NextID, m.NextBlock)
		}
	}
}

// Replace your CheckAllStateSyncTxs with this version.
func CheckAllStateSyncTxs(startBlock, endBlock, interval, concurrency uint64, remoteRPCUrl string) ([]Tx, error) {
	results := concurrentFetchAllStateSyncTxs(startBlock, endBlock, interval, int(concurrency), remoteRPCUrl)

	// We'll collect everything to preserve original output context.
	var alltxs []Tx

	// We detect gaps on the fly, keeping track of the last seen StateSyncId and its block.
	var intervals []MissedInterval
	var prevID uint64
	var prevBlock uint64
	var havePrev bool

	for i := 0; i < len(results); i++ {
		txs := results[i]
		alltxs = append(alltxs, txs...)

		for _, tx := range txs {
			val, _ := strconv.ParseUint(tx.StateSyncId[2:], 16, 64)

			// Only report gaps after we've seen at least one id.
			if havePrev && val > prevID+1 {
				intervals = append(intervals, MissedInterval{
					Start:     prevID + 1,
					End:       val - 1,
					PrevID:    prevID,
					NextID:    val,
					PrevBlock: prevBlock,
					NextBlock: tx.BlockNumber,
				})
			}

			prevID = val
			prevBlock = tx.BlockNumber
			havePrev = true
		}
	}

	fmt.Printf("Total amount of txs in the range: %d\n", len(alltxs))
	if len(alltxs) > 0 {
		fmt.Printf("First StateSyncId: %s @ block %d\n", alltxs[0].StateSyncId, alltxs[0].BlockNumber)
		last := alltxs[len(alltxs)-1]
		fmt.Printf("Last  StateSyncId: %s @ block %d\n", last.StateSyncId, last.BlockNumber)
	} else {
		fmt.Println("First/Last StateSyncId: (no transactions found in range)")
	}

	fmt.Println()
	printMissedIntervals(intervals)

	if len(intervals) > 0 {
		return nil, errors.New("no consecutive interval")
	}
	return alltxs, nil
}

func concurrentFetchAllStateSyncTxs(startBlock, endBlock, interval uint64, concurrency int, remoteRPCUrl string) [][]Tx {
	ranges := makeRanges(startBlock, endBlock, interval)
	total := len(ranges)
	if total == 0 {
		return nil
	}

	// Fetch in parallel, but store results by index so we can process in order.
	results := make([][]Tx, total)

	if concurrency < 1 {
		concurrency = 1
	}

	type idxRange struct {
		i        int
		from, to uint64
	}
	jobs := make(chan idxRange)

	var completed int64
	start := time.Now()

	var wg sync.WaitGroup
	wg.Add(concurrency)
	for w := 0; w < concurrency; w++ {
		go func(worker int) {
			defer wg.Done()
			for j := range jobs {
				// NOTE: getStateSyncTxns takes int; convert safely
				results[j.i] = getStateSyncTxns(int(j.from), int(j.to), remoteRPCUrl)

				// --- progress + ETA ---
				done := atomic.AddInt64(&completed, 1)
				elapsed := time.Since(start)
				remaining := total - int(done)

				var eta time.Duration
				if done > 0 && remaining > 0 {
					avgPer := elapsed / time.Duration(done)
					eta = time.Duration(remaining) * avgPer
				}

				pct := float64(done) / float64(total) * 100
				log.Printf("progress: %d/%d (%.1f%%), eta: %s",
					done, total, pct, formatETA(eta))
			}
		}(w)
	}

	for i, r := range ranges {
		jobs <- idxRange{i: i, from: r[0], to: r[1]}
	}
	close(jobs)
	wg.Wait()

	return results
}

// Helper to format durations as HH:MM:SS
func formatETA(d time.Duration) string {
	if d <= 0 {
		return "00:00:00"
	}
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	s := int(d.Seconds()) % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

func makeRanges(startBlock, endBlock, interval uint64) [][2]uint64 {
	if interval == 0 {
		interval = 1
	}
	var out [][2]uint64
	for s := startBlock; s <= endBlock; {
		// Use inclusive upper bound and cap to endBlock
		to := s + interval - 1
		if to > endBlock {
			to = endBlock
		}
		out = append(out, [2]uint64{s, to})

		if to == endBlock {
			break
		}
		s = to + 1
	}
	return out
}
