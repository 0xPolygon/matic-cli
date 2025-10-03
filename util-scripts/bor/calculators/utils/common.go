package utils

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
)

const (
	DefaultRPC   = "https://polygon-rpc.com"
	JsonrpcVer   = "2.0"
	HttpTimeout  = 20 * time.Second
	MaxRetries   = 3
	RetryBackoff = 600 * time.Millisecond
)

type RpcRequest struct {
	JSONRPC string        `json:"jsonrpc"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
	ID      int           `json:"id"`
}

type RpcResponse[T any] struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Result  T      `json:"result"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type Block struct {
	Number    string `json:"number"`
	Timestamp string `json:"timestamp"`
}

func GetLatestBlockNumber(ctx context.Context, client *http.Client, rpcURL string) (uint64, error) {
	var hex string
	if err := RpcCall(ctx, client, rpcURL, "eth_blockNumber", []interface{}{}, &hex); err != nil {
		return 0, err
	}
	return HexToUint64(hex)
}

func GetBlockTimestamp(ctx context.Context, client *http.Client, rpcURL string, height uint64) (uint64, error) {
	hexHeight := fmt.Sprintf("0x%x", height)
	params := []interface{}{hexHeight, false}
	var respBlock *Block
	if err := RpcCall(ctx, client, rpcURL, "eth_getBlockByNumber", params, &respBlock); err != nil {
		return 0, err
	}
	if respBlock == nil || respBlock.Timestamp == "" {
		return 0, fmt.Errorf("empty block/timestamp for height %d", height)
	}
	return HexToUint64(respBlock.Timestamp)
}

func RpcCall[T any](ctx context.Context, client *http.Client, rpcURL, method string, params []interface{}, out *T) error {
	var lastErr error
	for attempt := 0; attempt < MaxRetries; attempt++ {
		reqBody := RpcRequest{
			JSONRPC: JsonrpcVer,
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
			time.Sleep(RetryBackoff * time.Duration(attempt+1))
			continue
		}

		var decoded RpcResponse[T]
		dec := json.NewDecoder(resp.Body)
		err = dec.Decode(&decoded)
		_ = resp.Body.Close()
		if err != nil {
			lastErr = err
			time.Sleep(RetryBackoff * time.Duration(attempt+1))
			continue
		}
		if decoded.Error != nil {
			lastErr = errors.New(decoded.Error.Message)
			time.Sleep(RetryBackoff * time.Duration(attempt+1))
			continue
		}
		*out = decoded.Result
		return nil
	}
	return fmt.Errorf("rpc %s failed after %d attempts: %v", method, MaxRetries, lastErr)
}

func HexToUint64(h string) (uint64, error) {
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

func WithCommas(u uint64) string {
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

func IsoTime(unixSec uint64) string {
	return time.Unix(int64(unixSec), 0).UTC().Format(time.RFC3339)
}

func ElapsedDHMS(totalSec int64) string {
	if totalSec < 0 {
		totalSec = -totalSec
	}
	d := totalSec / 86400
	r := totalSec % 86400
	h := r / 3600
	r %= 3600
	m := r / 60
	s := r % 60
	return fmt.Sprintf("%dd %dh %dm %ds", d, h, m, s)
}
