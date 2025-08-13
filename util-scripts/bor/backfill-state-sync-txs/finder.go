package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"context"

	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/core/types"
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
	var file, err = os.OpenFile(outputFile, os.O_RDWR|os.O_CREATE, 0755)
	if err != nil {
		return
	}
	results := concurrentFetchAllStateSyncTxs(startBlock, endBlock, interval, int(concurrency), remoteRPCUrl)

	for i := 0; i < len(results); i++ {
		txs := results[i]
		for _, tx := range txs {
			lookupKey := DebugEncodeBorTxLookupEntry(tx.Hash, false)
			lookupValue := fmt.Sprintf("0x%s", common.Bytes2Hex(big.NewInt(0).SetUint64(tx.BlockNumber).Bytes()))

			receiptKey := DebugEncodeBorReceiptKey(tx.BlockNumber, tx.BlockHash, false)
			receiptValue := DebugEncodeBorReceiptValue(tx.Hash, remoteRPCUrl, false)

			writeInstructions = append(writeInstructions, WriteInstruction{Key: lookupKey, Value: lookupValue})
			writeInstructions = append(writeInstructions, WriteInstruction{Key: receiptKey, Value: receiptValue})
		}
	}
	fmt.Println("Total no of records from PS: ", psCount)

	fmt.Println()

	b, err := json.MarshalIndent(writeInstructions, "", "    ")
	if err != nil {
		log.Fatalf("json.MarshalIndent failed: %v", err)
	}
	file.WriteString(string(b))
	defer file.Close()

}

func checkTxs(txs []Tx, file *os.File, localRPC string) {

	// curl localhost:8545 -X POST -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["0xd96ecec3ac99e7e0f1edc62cff7d349c8c51cbfd0efc72f00662ecee6d41b14a"],"id":0}'

	// url := "http://localhost:80"

	for _, tx := range txs {
		var jsonStr = []byte(`{"jsonrpc":"2.0","method":"eth_getTransactionByHash","params":["` + tx.Hash + `"],"id":0}`)
		req, err := http.NewRequest("POST", localRPC, bytes.NewBuffer(jsonStr))
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			panic(err)
		}
		defer resp.Body.Close()

		// fmt.Println("response Status:", resp.Status)
		// fmt.Println("response Headers:", resp.Header)
		body, _ := io.ReadAll(resp.Body)

		var result TxResponse
		if err := json.Unmarshal(body, &result); err != nil { // Parse []byte to the go struct pointer
			fmt.Println("Bor: Cannot unmarshal JSON")
			fmt.Println(string(body))
		}

		// fmt.Println("response Body:", string(body))

		jsonStr, err = json.Marshal(tx)
		if err != nil {
			fmt.Println("Bor: Error dumping json")
		}

		if result.Result == nil {
			file.WriteString(string(jsonStr) + "\n")
			missingTxs += 1
		}

	}
}

func CheckAllStateSyncTxs(startBlock, endBlock, interval, concurrency uint64, remoteRPCUrl string) {
	results := concurrentFetchAllStateSyncTxs(startBlock, endBlock, interval, int(concurrency), remoteRPCUrl)

	// Now process strictly in original call order.
	var alltxs []Tx
	var missingStateSyncIds []uint64
	var currentStateSyncId uint64

	for i := 0; i < len(results); i++ {
		txs := results[i]
		alltxs = append(alltxs, txs...)
		for _, tx := range txs {
			val, _ := strconv.ParseUint(tx.StateSyncId[2:], 16, 64)
			if currentStateSyncId != 0 && val-1 != currentStateSyncId {
				for missing := val - 1; missing > currentStateSyncId; missing-- {
					missingStateSyncIds = append(missingStateSyncIds, missing)
				}
			}
			// fmt.Printf("Found State Sync Id: %s (%d) | txHash: %s \n", tx.StateSyncId, val, tx.Hash)
			currentStateSyncId = val
		}
	}

	fmt.Printf("Total amount of txs in the range: %d\n", len(alltxs))
	if len(alltxs) > 0 {
		fmt.Printf("First StateSyncId: %s\n", alltxs[0].StateSyncId)
		fmt.Printf("Last StateSyncId: %s\n", alltxs[len(alltxs)-1].StateSyncId)
	} else {
		fmt.Println("First/Last StateSyncId: (no transactions found in range)")
	}
	fmt.Printf("\nMissed State Sync:\n\n")
	for _, ssid := range missingStateSyncIds {
		fmt.Printf("%d\n", ssid)
	}
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
