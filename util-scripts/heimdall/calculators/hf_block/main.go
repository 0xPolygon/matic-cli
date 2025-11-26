package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"heimdall_calculators/utils"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"
)

func main() {
	base := flag.String("url", utils.DefaultCometURL, "Base URL for the Tendermint RPC-compatible API")
	timeout := flag.Duration("timeout", 15*time.Second, "HTTP request timeout")
	targetStr := flag.String("target", "", "Target time in RFC3339 or RFC3339Nano (UTC)")
	avgSecs := flag.Float64("avg", 0, "Average block time in seconds (e.g., 2.15)")
	flag.Parse()

	if *targetStr == "" || *avgSecs == 0 {
		fmt.Printf("Please pass a target and average as arguments of the script, e.g.:\n go run main.go -target=\"2025-10-07T14:00:00Z\" -avg=1.6\n")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()

	httpc := &http.Client{Timeout: *timeout}

	// Get current height + time
	latestHeight, latestTime, _, err := getLatest(ctx, httpc, *base)
	if err != nil {
		panic(fmt.Errorf("get latest: %w", err))
	}
	fmt.Printf("Current block: %d at %s\n\n",
		latestHeight, latestTime.Format(time.RFC3339Nano))

	targetTime, err := time.Parse(time.RFC3339Nano, *targetStr)
	if err != nil {
		panic(fmt.Errorf("parse target time: %w", err))
	}

	delta := targetTime.Sub(latestTime)
	if delta < 0 {
		fmt.Printf("Target time %s is in the past relative to latest block.\n", targetTime.Format(time.RFC3339))
		return
	}

	blocksToAdd := int64(delta.Seconds() / *avgSecs)
	predicted := latestHeight + blocksToAdd

	fmt.Println("Future block prediction:")
	fmt.Printf("  target time     : %s\n", targetTime.Format(time.RFC3339))
	fmt.Printf("  avg block time  : %.2f s\n", *avgSecs)
	fmt.Printf("  time delta      : %dd %dh %dm %ds\n", int(delta.Hours())/24, int(delta.Hours())%24, int(delta.Minutes())%60, int(delta.Seconds())%60)
	fmt.Printf("  blocks to add   : %d\n", blocksToAdd)
	fmt.Printf("  predicted height: %d\n", predicted)
}

func getLatest(ctx context.Context, c *http.Client, base string) (height int64, t time.Time, earliest int64, err error) {
	u := base + "/status"
	var sr utils.StatusResp
	if err = getJSON(ctx, c, u, &sr); err != nil {
		return
	}
	h, err1 := strconv.ParseInt(sr.Result.SyncInfo.LatestBlockHeight, 10, 64)
	if err1 != nil {
		err = fmt.Errorf("parse latest height: %w", err1)
		return
	}
	earliest, err1 = strconv.ParseInt(sr.Result.SyncInfo.EarliestBlockH, 10, 64)
	if err1 != nil {
		err = fmt.Errorf("parse earliest height: %w", err1)
		return
	}
	t, err1 = time.Parse(time.RFC3339Nano, sr.Result.SyncInfo.LatestBlockTime)
	if err1 != nil {
		err = fmt.Errorf("parse latest time: %w", err1)
		return
	}
	height = h
	return
}

func getJSON(ctx context.Context, c *http.Client, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer func(Body io.ReadCloser) {
		_ = Body.Close()
	}(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}
	dec := json.NewDecoder(resp.Body)
	return dec.Decode(out)
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

func failf(format string, a ...any) {
	_, _ = fmt.Fprintf(os.Stderr, "error: "+format+"\n", a...)
	os.Exit(1)
}
