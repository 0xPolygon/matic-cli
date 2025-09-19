package main

import (
	"bor_calculators/utils"
	"context"
	"flag"
	"fmt"
	"math"
	"net/http"
	"os"
)

func main() {
	rpcURL := flag.String("rpc", utils.DefaultRPC, "Polygon (Bor) JSON-RPC endpoint")
	flag.Parse()

	client := &http.Client{Timeout: utils.HttpTimeout}
	ctx := context.Background()

	// 1) latest block n
	n, err := utils.GetLatestBlockNumber(ctx, client, *rpcURL)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "error: get latest block number: %v\n", err)
		os.Exit(1)
	}

	// 2) targets {n, n-40000, n-280000, n-560000, n-1120000}
	targets := []target{
		{kind: "relative", delta: 0},
		{kind: "relative", delta: -40000},
		{kind: "relative", delta: -280000},
		{kind: "relative", delta: -560000},
		{kind: "relative", delta: -1120000},
	}

	// Resolve valid heights (skip negatives/future)
	var heights []uint64
	for _, t := range targets {
		if h, ok := t.resolve(n); ok {
			heights = append(heights, h)
		}
	}

	// Fetch timestamps
	type info struct {
		height    uint64
		timestamp uint64
	}
	infos := make(map[uint64]info)
	for _, h := range heights {
		ts, err := utils.GetBlockTimestamp(ctx, client, *rpcURL, h)
		if err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "warning: failed to fetch block %d: %v\n", h, err)
			continue
		}
		infos[h] = info{height: h, timestamp: ts}
	}

	// Ensure n present
	nTS, ok := func() (uint64, bool) {
		if x, ok := infos[n]; ok {
			return x.timestamp, true
		}
		ts, err := utils.GetBlockTimestamp(ctx, client, *rpcURL, n)
		if err != nil {
			return 0, false
		}
		infos[n] = info{height: n, timestamp: ts}
		return ts, true
	}()
	if !ok {
		_, _ = fmt.Fprintf(os.Stderr, "error: failed to fetch latest block %d timestamp\n", n)
		os.Exit(1)
	}

	// 5) Pretty header for the current block
	fmt.Printf("Current block: %s — %s (UTC)\n",
		utils.WithCommas(n),
		utils.IsoTime(infos[n].timestamp),
	)

	// 6) Pretty per-reference output
	for _, t := range targets {
		h, ok := t.resolve(n)
		if !ok || h == n {
			continue
		}
		src, ok := infos[h]
		if !ok {
			continue
		}

		blockDiff := int64(n) - int64(h)
		secDiff := int64(nTS) - int64(src.timestamp)
		avg := math.NaN()
		if blockDiff != 0 {
			avg = float64(secDiff) / float64(blockDiff)
		}

		// First line: Δ<blocks> from <h> (<iso>) → <n>
		deltaLabel := fmt.Sprintf("Δ%d", blockDiff) // no commas to match the inspiration
		fmt.Printf("\n%-10s from height %s (%s)  \u2192  %s\n",
			deltaLabel,
			utils.WithCommas(h),
			utils.IsoTime(src.timestamp),
			utils.WithCommas(n),
		)

		// Second line: elapsed (as 0d Xh Ym Zs, always showing units)
		fmt.Printf("  elapsed    : %s\n", utils.ElapsedDHMS(secDiff))

		// Third line: avg block time (seconds and milliseconds)
		fmt.Printf("  avg block  : %.6f s/block  (%.3f ms)\n",
			avg,
			avg*1000.0,
		)
	}
}

type target struct {
	kind  string // "relative" or "absolute"
	delta int64  // for relative
	value uint64 // for absolute
}

func (t target) resolve(n uint64) (uint64, bool) {
	switch t.kind {
	case "relative":
		if t.delta >= 0 {
			return n + uint64(t.delta), true
		}
		d := uint64(-t.delta)
		if d > n {
			return 0, false
		}
		return n - d, true
	case "absolute":
		if t.value > n {
			return 0, false
		}
		return t.value, true
	default:
		return 0, false
	}
}
