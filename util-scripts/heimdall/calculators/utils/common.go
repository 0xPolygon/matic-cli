package utils

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

const DefaultCometURL = "https://tendermint-api.polygon.technology"

type StatusResp struct {
	Result struct {
		SyncInfo struct {
			LatestBlockHeight string `json:"latest_block_height"`
			LatestBlockTime   string `json:"latest_block_time"`
			EarliestBlockH    string `json:"earliest_block_height"`
		} `json:"sync_info"`
	} `json:"result"`
}

func GetLatest(ctx context.Context, c *http.Client, baseURL string) (height int64, t time.Time, earliest int64, err error) {
	u := baseURL + "/status"
	var sr StatusResp
	if err = GetJSON(ctx, c, u, &sr); err != nil {
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

func GetJSON(ctx context.Context, c *http.Client, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}
	dec := json.NewDecoder(resp.Body)
	return dec.Decode(out)
}
