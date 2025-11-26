package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"heimdall_calculators/utils"
	"net/http"
	"time"
)

type blockResp struct {
	Result struct {
		Block struct {
			Header struct {
				Height string `json:"height"`
				Time   string `json:"time"`
			} `json:"header"`
		} `json:"block"`
	} `json:"result"`
}

func main() {
	baseUrl := flag.String("base", utils.DefaultCometURL, "Base URL for the Tendermint RPC-compatible API")
	timeout := flag.Duration("timeout", 15*time.Second, "HTTP request timeout")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	httpc := &http.Client{Timeout: *timeout}

	latestHeight, latestTime, earliestHeight, err := utils.GetLatest(ctx, httpc, *baseUrl)
	if err != nil {
		panic(fmt.Errorf("get latest: %w", err))
	}

	fmt.Printf("Current block: %d at %s (earliest available: %d)\n\n",
		latestHeight, latestTime.Format(time.RFC3339Nano), earliestHeight)

	lookBacks := []int64{10_000, 100_000, 1_000_000, 1_500_000}
	for _, lb := range lookBacks {
		target := latestHeight - lb
		if target < earliestHeight {
			fmt.Printf("Δ%-9d SKIP  target height %d < earliest available %d\n", lb, target, earliestHeight)
			continue
		}
		t0, err := getBlockTime(ctx, httpc, *baseUrl, target)
		if err != nil {
			fmt.Printf("Δ%-9d ERROR fetching height %d: %v\n", lb, target, err)
			continue
		}
		elapsed := latestTime.Sub(t0)                 // total time elapsed
		avgSeconds := elapsed.Seconds() / float64(lb) // average seconds per block

		fmt.Printf("Δ%-9d from height %-10d to %-10d\n", lb, target, latestHeight)
		fmt.Printf("  elapsed    : %s\n", formatElapsed(elapsed))
		fmt.Printf("  avg block  : %.6f s/block  (%.3f ms)\n\n", avgSeconds, avgSeconds*1000.0)
	}
}

func formatElapsed(d time.Duration) string {
	if d < 0 {
		d = -d
	}
	days := d / (24 * time.Hour)
	d -= days * 24 * time.Hour
	hours := d / time.Hour
	d -= hours * time.Hour
	mins := d / time.Minute
	d -= mins * time.Minute
	secs := d / time.Second

	return fmt.Sprintf("%dd %dh %dm %ds", days, hours, mins, secs)
}

func getBlockTime(ctx context.Context, c *http.Client, base string, height int64) (time.Time, error) {
	u := fmt.Sprintf("%s/block?height=%d", base, height)
	var br blockResp
	if err := utils.GetJSON(ctx, c, u, &br); err != nil {
		return time.Time{}, err
	}
	ts := br.Result.Block.Header.Time
	if ts == "" {
		return time.Time{}, errors.New("empty block time")
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse block time: %w", err)
	}
	return t, nil
}
