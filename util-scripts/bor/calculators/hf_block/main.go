package main

import (
	"bor_calculators/utils"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	rpcURL := flag.String("rpc", utils.DefaultRPC, "Polygon (Bor) JSON-RPC endpoint")
	targetStr := flag.String("target", "", "Target time in RFC3339 or RFC3339Nano (UTC)")
	avgSecs := flag.Float64("avg", 0, "Average block time in seconds (e.g., 2.15)")
	flag.Parse()
	if *targetStr == "" || *avgSecs == 0 {
		fmt.Printf("Please pass a target and average as arguments of the script, e.g.:\n go run main.go -target=\"2025-10-07T14:00:00Z\" -avg=2.156\n")
		return
	}

	client := &http.Client{Timeout: utils.HttpTimeout}
	ctx := context.Background()

	// 1) Fetch current block height and timestamp
	n, err := getLatestBlockNumber(ctx, client, *rpcURL)
	if err != nil {
		failf("get latest block number: %v", err)
	}
	curTS, err := getBlockTimestamp(ctx, client, *rpcURL, n)
	if err != nil {
		failf("get timestamp for current block %d: %v", n, err)
	}
	now := time.Unix(int64(curTS), 0).UTC()

	// 2) Parse target time
	target, err := parseTarget(*targetStr)
	if err != nil {
		failf("parse target time: %v", err)
	}

	// 3) Calculate time delta
	delta := target.Sub(now)
	deltaSeconds := delta.Seconds()

	// 4) Estimate the number of blocks
	avg := *avgSecs
	blocksFloat := deltaSeconds / avg
	blocksRounded := int64(math.Round(blocksFloat))

	// 5) Predicted height
	predicted := int64(n) + blocksRounded
	if predicted < 0 {
		predicted = 0
	}

	// 6) Pretty print
	fmt.Printf("Current block : %s — %s (UTC)\n", withCommas(n), now.Format(time.RFC3339))
	fmt.Printf("Target time   : %s (UTC)\n", target.Format(time.RFC3339))
	fmt.Printf("Avg block     : %.6f s\n", avg)

	sign := "+"
	if delta < 0 {
		sign = "-"
	}
	fmt.Printf("\nΔtime         : %s%s (%s s)\n", sign, elapsedDHMS(delta), withCommasUint64(uint64(math.Abs(deltaSeconds))))
	fmt.Printf("Estimated Δblk: %s%s (rounded) — %.3f (exact)\n", sign, withCommasInt64(absInt64(blocksRounded)), blocksFloat)

	fmt.Printf("\nPredicted block at target:\n")
	fmt.Printf("  height      : %s\n", withCommasUint64(uint64(predicted)))
}

func parseTarget(s string) (time.Time, error) {
	// Try RFC3339Nano first, then RFC3339
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t.UTC(), nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, fmt.Errorf("unsupported time format %q (use RFC3339/RFC3339Nano, e.g. 2025-10-07T14:00:00Z)", s)
}

func getLatestBlockNumber(ctx context.Context, client *http.Client, rpcURL string) (uint64, error) {
	var hex string
	if err := rpcCall(ctx, client, rpcURL, "eth_blockNumber", []interface{}{}, &hex); err != nil {
		return 0, err
	}
	return hexToUint64(hex)
}

func getBlockTimestamp(ctx context.Context, client *http.Client, rpcURL string, height uint64) (uint64, error) {
	hexHeight := fmt.Sprintf("0x%x", height)
	params := []interface{}{hexHeight, false}
	var respBlock *utils.Block
	if err := rpcCall(ctx, client, rpcURL, "eth_getBlockByNumber", params, &respBlock); err != nil {
		return 0, err
	}
	if respBlock == nil || respBlock.Timestamp == "" {
		return 0, fmt.Errorf("empty block/timestamp for height %d", height)
	}
	return hexToUint64(respBlock.Timestamp)
}

func rpcCall[T any](ctx context.Context, client *http.Client, rpcURL, method string, params []interface{}, out *T) error {
	var lastErr error
	for attempt := 0; attempt < utils.MaxRetries; attempt++ {
		reqBody := utils.RpcRequest{
			JSONRPC: utils.JsonrpcVer,
			Method:  method,
			Params:  params,
			ID:      1,
		}
		b, _ := json.Marshal(reqBody)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, rpcURL, bytes.NewReader(b))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(utils.RetryBackoff * time.Duration(attempt+1))
			continue
		}

		var decoded utils.RpcResponse[T]
		dec := json.NewDecoder(resp.Body)
		err = dec.Decode(&decoded)
		_ = resp.Body.Close()
		if err != nil {
			lastErr = err
			time.Sleep(utils.RetryBackoff * time.Duration(attempt+1))
			continue
		}
		if decoded.Error != nil {
			lastErr = errors.New(decoded.Error.Message)
			time.Sleep(utils.RetryBackoff * time.Duration(attempt+1))
			continue
		}
		*out = decoded.Result
		return nil
	}
	return fmt.Errorf("rpc %s failed after %d attempts: %v", method, utils.MaxRetries, lastErr)
}

func hexToUint64(h string) (uint64, error) {
	if strings.HasPrefix(h, "0x") || strings.HasPrefix(h, "0X") {
		h = h[2:]
	}
	if h == "" {
		return 0, fmt.Errorf("empty hex string")
	}
	bi := new(big.Int)
	if _, ok := bi.SetString(h, 16); !ok {
		return 0, fmt.Errorf("invalid hex %q", h)
	}
	if bi.Sign() < 0 || !bi.IsUint64() {
		return 0, fmt.Errorf("hex %q out of uint64 range", h)
	}
	return bi.Uint64(), nil
}

func withCommas(u uint64) string { return withCommasUint64(u) }

func withCommasUint64(u uint64) string {
	s := fmt.Sprintf("%d", u)
	n := len(s)
	if n <= 3 {
		return s
	}
	var b strings.Builder
	pre := n % 3
	if pre == 0 {
		pre = 3
	}
	b.WriteString(s[:pre])
	for i := pre; i < n; i += 3 {
		b.WriteByte(',')
		b.WriteString(s[i : i+3])
	}
	return b.String()
}

func withCommasInt64(v int64) string {
	if v < 0 {
		return "-" + withCommasUint64(uint64(-v))
	}
	return withCommasUint64(uint64(v))
}

func absInt64(v int64) int64 {
	if v < 0 {
		return -v
	}
	return v
}

func elapsedDHMS(d time.Duration) string {
	neg := d < 0
	if neg {
		d = -d
	}
	totalSec := int64(d.Seconds())
	dd := totalSec / 86400
	r := totalSec % 86400
	hh := r / 3600
	r %= 3600
	mm := r / 60
	ss := r % 60
	prefix := ""
	if neg {
		prefix = "-"
	}
	return fmt.Sprintf("%s%dd %dh %dm %ds", prefix, dd, hh, mm, ss)
}

func failf(format string, a ...any) {
	_, _ = fmt.Fprintf(os.Stderr, "error: "+format+"\n", a...)
	os.Exit(1)
}
