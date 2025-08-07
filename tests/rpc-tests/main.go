package main

import (
	"bytes"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"math/big"
	"math/rand"
	"net/http"
	"os"
	testcontract "rpc-tests/contracts"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/consensus/bor"
	"github.com/ethereum/go-ethereum/consensus/bor/valset"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	hdwallet "github.com/miguelmota/go-ethereum-hdwallet"
)

// Request represents the JSON-RPC request payload.
type Request struct {
	JsonRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
	ID      int         `json:"id"`
}

// Response represents the JSON-RPC response payload.
type Response struct {
	JsonRPC string          `json:"jsonrpc"`
	ID      int             `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *RPCError       `json:"error"`
}

// RPCError represents an error in a JSON-RPC response.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type ResponseMap struct {
	chainId                                *big.Int
	mostRecentBlockNumber                  *big.Int
	mostRecentBlockHash                    common.Hash
	mostRecentBlockParentHash              common.Hash
	currentProposerAddress                 common.Address
	account                                Account
	gasPrice                               *big.Int
	stateSyncTxHash                        common.Hash
	stateSyncBlockNumber                   *big.Int
	stateSyncBlockHash                     common.Hash
	stateSyncTxIndex                       int
	stateSyncExpectedBlockTransactionCount int
	expectedGasToCreateTransaction         *big.Int
	expectedValueToStoreInContract         *big.Int
	expectedSlot0Value                     *big.Int
	expectedKeyToStoreInContract           string
	pushedTxHash                           common.Hash
	pushedTxBlockNumber                    *big.Int
	pushedTxBlockHash                      common.Hash
	pushedTxTransactionIndex               *big.Int
	pushedTxDeployedContractAddress        common.Address
	expectedRawTx                          string
	pushedTxDeployedContractRuntimeCode    *[]byte
	filterId                               string
	blockFilterId                          string
}
type Account struct {
	key   *ecdsa.PrivateKey
	addr  common.Address
	nonce *big.Int
}
type Accounts []Account
type feeHistoryResult struct {
	OldestBlock      *hexutil.Big     `json:"oldestBlock"`
	Reward           [][]*hexutil.Big `json:"reward,omitempty"`
	BaseFee          []*hexutil.Big   `json:"baseFeePerGas,omitempty"`
	GasUsedRatio     []float64        `json:"gasUsedRatio"`
	BlobBaseFee      []*hexutil.Big   `json:"baseFeePerBlobGas,omitempty"`
	BlobGasUsedRatio []float64        `json:"blobGasUsedRatio,omitempty"`
}

type RPCTransaction struct {
	BlockHash           *common.Hash      `json:"blockHash"`
	BlockNumber         *hexutil.Big      `json:"blockNumber"`
	From                common.Address    `json:"from"`
	Gas                 hexutil.Uint64    `json:"gas"`
	GasPrice            *hexutil.Big      `json:"gasPrice"`
	GasFeeCap           *hexutil.Big      `json:"maxFeePerGas,omitempty"`
	GasTipCap           *hexutil.Big      `json:"maxPriorityFeePerGas,omitempty"`
	MaxFeePerBlobGas    *hexutil.Big      `json:"maxFeePerBlobGas,omitempty"`
	Hash                common.Hash       `json:"hash"`
	Input               hexutil.Bytes     `json:"input"`
	Nonce               hexutil.Uint64    `json:"nonce"`
	To                  *common.Address   `json:"to"`
	TransactionIndex    *hexutil.Uint64   `json:"transactionIndex"`
	Value               *hexutil.Big      `json:"value"`
	Type                hexutil.Uint64    `json:"type"`
	Accesses            *types.AccessList `json:"accessList,omitempty"`
	ChainID             *hexutil.Big      `json:"chainId,omitempty"`
	BlobVersionedHashes []common.Hash     `json:"blobVersionedHashes,omitempty"`
	V                   *hexutil.Big      `json:"v"`
	R                   *hexutil.Big      `json:"r"`
	S                   *hexutil.Big      `json:"s"`
	YParity             *hexutil.Uint64   `json:"yParity,omitempty"`
}

type TestCase struct {
	Key            string
	PrepareRequest func(*ResponseMap) (*Request, error)
	HandleResponse func(*ResponseMap, Response) error
}

type BatchTestCase []TestCase
type FailedTestCase struct {
	Err error
	Key string
	Req Request
	Res Response
}
type SignTransactionResult struct {
	Raw hexutil.Bytes      `json:"raw"`
	Tx  *types.Transaction `json:"tx"`
}

type accessListResult struct {
	Accesslist *types.AccessList `json:"accessList"`
	Error      string            `json:"error,omitempty"`
	GasUsed    hexutil.Uint64    `json:"gasUsed"`
}

type storageResult struct {
	Key   string       `json:"key"`
	Value *hexutil.Big `json:"value"`
	Proof []string     `json:"proof"`
}

type accountResult struct {
	Address      common.Address  `json:"address"`
	AccountProof []string        `json:"accountProof"`
	Balance      *hexutil.Big    `json:"balance"`
	CodeHash     common.Hash     `json:"codeHash"`
	Nonce        hexutil.Uint64  `json:"nonce"`
	StorageHash  common.Hash     `json:"storageHash"`
	StorageProof []storageResult `json:"storageProof"`
}

var (
	rpcURL      = flag.String("rpc-url", "", "RPC Url to be tested")
	mnemonic    = flag.String("mnemonic", "", "mnemonic to be used on transactions")
	privKey     = flag.String("priv-key", "", "privKey to be used on transactions")
	filterTests = flag.Bool("filter-test", false, "True if want to include filter tests (recommended just when there is no load balancer)")
	logReqRes   = flag.Bool("log-req-res", false, "True if want to log requests and responses)")
)

func main() {
	flag.Parse()
	if *mnemonic == "" && *privKey == "" {
		fmt.Println("Must provide either mnemonic or privKey")
		os.Exit(1)
		return
	}
	if *rpcURL == "" {
		fmt.Println("Invalid rpcURL flag")
		os.Exit(1)
		return
	}

	// Ethereum node RPC endpoint
	mapTestCases := testCasesToMap(testCases)
	rm := ResponseMap{}
	mapRequestIdToKey := make(map[int]string)
	var failedTestCases []FailedTestCase
	if *mnemonic != "" {
		rm.account = generateAccountsUsingMnemonic(*mnemonic, 1)[0]
	} else {
		acc, _ := generateAccountUsingPrivKey(*privKey)
		rm.account = *acc
	}

	rm.expectedGasToCreateTransaction = big.NewInt(354658)
	rm.expectedValueToStoreInContract = big.NewInt(30)
	rm.expectedKeyToStoreInContract = "key"
	rm.expectedSlot0Value = big.NewInt(42) // first variable set on contract

	// Test cases are grouped into batches when there are no dependencies between them.
	// If one test case depends on the response of another to construct its request,
	// it should be placed in a subsequent batch to maintain the correct order.
	testCaseBatches := []BatchTestCase{
		{
			mapTestCases["bor_getAuthor (no params)"],
			mapTestCases["bor_getCurrentProposer"],
			mapTestCases["bor_getCurrentValidators"],
			mapTestCases["bor_getSnapshotProposer"],
			mapTestCases["bor_getSnapshotProposerSequence"],
			mapTestCases["eth_blockNumber"],
			mapTestCases["eth_chainId"],
			mapTestCases["eth_feeHistory"],
			mapTestCases["eth_gasPrice"],
			mapTestCases["eth_getBalance"],
		}, {
			mapTestCases["eth_getTransactionCount"],
			mapTestCases["eth_maxPriorityFeePerGas"],
			mapTestCases["eth_syncing"],
		},
		{
			mapTestCases["bor_getAuthor (by number)"],
			mapTestCases["bor_getRootHash"],
			mapTestCases["bor_getSigners"],
			mapTestCases["bor_getSnapshot"],
			mapTestCases["eth_getBlockByNumber"],
			mapTestCases["eth_getHeaderByNumber"],
			mapTestCases["Create Transaction Scenario: eth_estimateGas"],
			mapTestCases["Create Transaction Scenario: eth_fillTransaction"],
			mapTestCases["StateSyncTx Scenario: eth_getLogs"],
		},
		{
			mapTestCases["bor_getAuthor (by hash)"],
			mapTestCases["bor_getSignersAtHash"],
			mapTestCases["bor_getSnapshotAtHash"],
			mapTestCases["eth_getBlockByHash"],
			mapTestCases["eth_getHeaderByHash"],
			mapTestCases["Create Transaction Scenario: eth_sendRawTransaction"],
			mapTestCases["Create Transaction Scenario: eth_createAccessList"],
			mapTestCases["StateSyncTx Scenario: eth_getTransactionReceipt"],
		},
		{
			mapTestCases["Create Transaction Scenario: eth_getRawTransactionByHash"],
			mapTestCases["Create Transaction Scenario: eth_getTransactionReceipt"],
			mapTestCases["StateSyncTx Scenario: eth_getBlockReceipts"],
			mapTestCases["StateSyncTx Scenario: eth_getTransactionByHash"],
			mapTestCases["StateSyncTx Scenario: eth_getTransactionReceiptsByBlock"],
			mapTestCases["StateSyncTx Scenario: eth_getTransactionByBlockHashAndIndex"],
			mapTestCases["StateSyncTx Scenario: eth_getTransactionByBlockNumberAndIndex"],
		},
		{
			mapTestCases["Create Transaction Scenario: eth_getCode"],
			mapTestCases["Create Transaction Scenario: eth_call"],
			mapTestCases["Create Transaction Scenario: eth_newFilter"],
			mapTestCases["Create Transaction Scenario: eth_newBlockFilter"],
			mapTestCases["Create Transaction Scenario: eth_getRawTransactionByBlockHashAndIndex"],
			mapTestCases["Create Transaction Scenario: eth_getRawTransactionByBlockNumberAndIndex"],
			mapTestCases["Create Transaction Scenario: eth_getStorageAt"],
			mapTestCases["Create Transaction Scenario: eth_getProof"],
			mapTestCases["StateSyncTx Scenario: eth_getBlockTransactionCountByHash"],
			mapTestCases["StateSyncTx Scenario: eth_getBlockTransactionCountByNumber"],
		},
	}

	if *filterTests {
		testCaseBatches = append(testCaseBatches, BatchTestCase{
			mapTestCases["Create Transaction Scenario: eth_getFilterChanges (from eth_newFilter)"],
			mapTestCases["Create Transaction Scenario: eth_getFilterChanges (from eth_newBlockFilter)"],
		})
	}

	timeStart := time.Now()
	countTestCases := 0
	for _, testCaseBatch := range testCaseBatches {
		// Preparing Request
		requests := make([]Request, 0)
		mapRequests := make(map[int]Request)
		countTestCases += len(testCaseBatch)
		for _, testCase := range testCaseBatch {
			req, err := testCase.PrepareRequest(&rm)
			if err != nil {
				failedTestCases = append(failedTestCases, FailedTestCase{Key: testCase.Key, Err: err})
				continue
			}
			if req == nil {
				continue
			}

			mapRequestIdToKey[req.ID] = testCase.Key
			mapRequests[req.ID] = *req

			requests = append(requests, *req)
		}

		responses, err := CallEthereumRPC(requests, *rpcURL)
		if err != nil {
			fmt.Printf("Error while calling Ethereum RPC: %v\n", err)
		}

		// Handling Response
		for _, response := range responses {
			key := mapRequestIdToKey[response.ID]
			if response.Error != nil {
				failedTestCases = append(failedTestCases, FailedTestCase{Key: key, Err: fmt.Errorf("request error; message: %s | code: %d", response.Error.Message, response.Error.Code), Req: mapRequests[response.ID], Res: response})
				continue
			}
			err := mapTestCases[key].HandleResponse(&rm, response)
			if err != nil {
				failedTestCases = append(failedTestCases, FailedTestCase{Key: key, Err: err, Req: mapRequests[response.ID], Res: response})
			}

		}
	}

	passedTests := countTestCases - len(failedTestCases)
	duration := time.Since(timeStart)

	fmt.Println("════════════════════════════════════════")
	fmt.Println("🚀  All Tests Executed!")
	fmt.Printf("✅  Success: %d/%d tests passed\n", passedTests, countTestCases)
	fmt.Printf("⌛  Duration: %s\n", duration)
	fmt.Println("════════════════════════════════════════")

	if len(failedTestCases) > 0 {
		fmt.Printf("\n\n")
		fmt.Println("❌ Failed Test Cases:")
		for _, failedTestCase := range failedTestCases {
			fmt.Printf("\n  🔎 Test Case Key: %s\n", failedTestCase.Key)
			fmt.Printf("      🚫 Error: %s\n", failedTestCase.Err)
			if *logReqRes {
				request, _ := json.Marshal(failedTestCase.Req)
				response, _ := json.Marshal(failedTestCase.Res)
				fmt.Printf("      📤 Request: %s\n", string(request))
				fmt.Printf("      📥 Response: %s\n", string(response))
			}
		}
		os.Exit(1)
	}
}

func testCasesToMap(testCases []TestCase) map[string]TestCase {
	mapTestCases := make(map[string]TestCase)
	for _, testCase := range testCases {
		mapTestCases[testCase.Key] = testCase
	}
	return mapTestCases
}

// CallEthereumRPC performs an RPC call to an Ethereum node.
func CallEthereumRPC(reqPayload []Request, rpcURL string) ([]Response, error) {
	// Serialize the request to JSON
	reqBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("error marshalling request: %w", err)
	}

	// Encapsulate the entire HTTP request/response cycle in a closure
	rpcResp, err := func() ([]Response, error) {
		// Make the HTTP POST request
		resp, err := http.Post(rpcURL, "application/json", bytes.NewBuffer(reqBytes))
		if err != nil {
			return nil, fmt.Errorf("error making RPC call: %w", err)
		}
		defer func(Body io.ReadCloser) {
			err := Body.Close()
			if err != nil {
				log.Fatalf("error closing the reader: %v", err)
			}
		}(resp.Body)

		// Read the response body
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("error reading response body: %w", err)
		}

		// Deserialize the response
		var internalResp []Response
		if err := json.Unmarshal(body, &internalResp); err != nil {
			return nil, fmt.Errorf("error unmarshalling response: %w", err)
		}

		return internalResp, nil
	}()
	if err != nil {
		return nil, err
	}

	// Return the final result
	return rpcResp, nil
}

// NewRequest creates a new Request with Jsonrpc set to "2.0" and other fields given as parameters.
func NewRequest(method string, params interface{}) *Request {
	return &Request{
		JsonRPC: "2.0",
		Method:  method,
		Params:  params,
		ID:      rand.Int(),
	}
}

func parseResponse[T any](raw json.RawMessage) (*T, error) {
	var response T
	if err := json.Unmarshal(raw, &response); err != nil {
		return nil, fmt.Errorf("error unmarshalling JSON: %w", err)
	}

	return &response, nil
}

func generateAccountsUsingMnemonic(MNEMONIC string, N int) (accounts Accounts) {
	wallet, err := hdwallet.NewFromMnemonic(MNEMONIC)
	if err != nil {
		log.Fatal(err)
	}

	for i := 0; i <= N; i++ {
		var derivPath = "m/44'/60'/0'/0/" + strconv.Itoa(i)
		path := hdwallet.MustParseDerivationPath(derivPath)
		account, err := wallet.Derive(path, false)
		if err != nil {
			log.Fatal(err)
		}

		privKey, err := wallet.PrivateKey(account)
		if err != nil {
			log.Fatal(err)
		}
		accounts = append(accounts, Account{key: privKey, addr: account.Address})
	}
	return accounts
}

// generateAccountUsingPrivKey creates an Account from a hex-encoded private key string.
func generateAccountUsingPrivKey(hexKey string) (*Account, error) {
	if strings.HasPrefix(hexKey, "0x") || strings.HasPrefix(hexKey, "0X") {
		hexKey = hexKey[2:]
	}

	privateKey, err := crypto.HexToECDSA(hexKey)
	if err != nil {
		return nil, fmt.Errorf("failed to convert hex to ECDSA private key: %w", err)
	}

	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, errors.New("cannot assert type: publicKey is not of type *ecdsa.PublicKey")
	}

	address := crypto.PubkeyToAddress(*publicKeyECDSA)

	return &Account{
		key:   privateKey,
		addr:  address,
		nonce: big.NewInt(0),
	}, nil
}

func hexStringToBigInt(hexString string) (*big.Int, error) {
	// Remove the "0x" prefix if present
	if len(hexString) >= 2 && hexString[:2] == "0x" {
		hexString = hexString[2:]
	}

	// Convert the hex string to an integer using big.Int
	intValue, success := new(big.Int).SetString(hexString, 16)
	if !success {
		return nil, fmt.Errorf("error converting hex string to integer")
	}
	return intValue, nil
}

func validateBlock(block map[string]interface{}) error {
	// Check if the block is nil
	if block == nil {
		return fmt.Errorf("block not found")
	}

	// Validate specific required fields
	requiredFields := []string{
		"baseFeePerGas", "difficulty", "gasLimit", "gasUsed",
		"hash", "number", "timestamp", "parentHash", "miner",
	}

	for _, field := range requiredFields {
		if _, ok := block[field]; !ok {
			return fmt.Errorf("missing required field: %s", field)
		}
	}

	// Validate "gasLimit" (cannot be zero)
	if err := validateHexBigInt(block["gasLimit"], "gasLimit", func(value *big.Int) error {
		if value.Cmp(big.NewInt(0)) == 0 {
			return errors.New("gasLimit cannot be zero")
		}
		return nil
	}); err != nil {
		return err
	}

	// Validate "timestamp" (should be within 1 hour of the current time)
	if err := validateHexBigInt(block["timestamp"], "timestamp", func(value *big.Int) error {
		currentTime := time.Now().Unix()
		blockTime := value.Int64()
		if blockTime < currentTime-3600 || blockTime > currentTime+3600 {
			return fmt.Errorf("timestamp is too far from current time: %d", blockTime)
		}
		return nil
	}); err != nil {
		return err
	}

	// Validate "miner" address length (must be 42 characters for Ethereum addresses)
	if miner, ok := block["miner"].(string); !ok || len(miner) != 42 {
		return fmt.Errorf("invalid miner address length: %s", miner)
	}

	// Validate "hash" (must be 66 characters )
	if hash, ok := block["hash"].(string); !ok || len(hash) != 66 {
		return fmt.Errorf("invalid hash: %s", hash)
	}

	// Additional checks for "parentHash" length
	if parentHash, ok := block["parentHash"].(string); !ok || len(parentHash) != 66 {
		return fmt.Errorf("invalid parentHash length: %s", parentHash)
	}

	// If all validations pass, return nil
	return nil
}

// validateHeader performs various checks on an Ethereum block header
func validateHeader(header map[string]interface{}) error {
	// Helper function to validate hex string
	validateHex := func(value string, fieldName string, exactLength int) error {
		if !strings.HasPrefix(value, "0x") {
			return fmt.Errorf("%s must start with 0x", fieldName)
		}

		value = strings.TrimPrefix(value, "0x")
		if exactLength > 0 && len(value) != exactLength {
			return fmt.Errorf("%s must be exactly %d hex chars long", fieldName, exactLength)
		}

		// Handle empty hex string after 0x
		if len(value) == 0 {
			return fmt.Errorf("%s cannot be empty", fieldName)
		}

		// Pad single digits with leading zero for hex decoding
		if len(value)%2 != 0 {
			value = "0" + value
		}

		if _, err := hex.DecodeString(value); err != nil {
			return fmt.Errorf("%s contains invalid hex characters", fieldName)
		}

		return nil
	}

	// Required fields check
	requiredFields := []string{
		"baseFeePerGas", "difficulty", "extraData", "gasLimit",
		"gasUsed", "hash", "logsBloom", "miner", "mixHash",
		"nonce", "number", "parentHash", "receiptsRoot",
		"sha3Uncles", "stateRoot", "timestamp", "transactionsRoot",
	}

	for _, field := range requiredFields {
		if _, exists := header[field]; !exists {
			return fmt.Errorf("missing required field: %s", field)
		}
	}

	// Validate hash (66 chars including 0x prefix = 32 bytes)
	if err := validateHex(header["hash"].(string), "hash", 64); err != nil {
		return err
	}

	// Validate parent hash
	if err := validateHex(header["parentHash"].(string), "parentHash", 64); err != nil {
		return err
	}

	// Validate miner address (42 chars including 0x prefix = 20 bytes)
	if err := validateHex(header["miner"].(string), "miner", 40); err != nil {
		return err
	}

	// Validate timestamps
	timestampHex := strings.TrimPrefix(header["timestamp"].(string), "0x")
	timestamp, _ := new(big.Int).SetString(timestampHex, 16)
	blockTime := time.Unix(timestamp.Int64(), 0)

	// Check if timestamp is within reasonable bounds (not more than 1 hour in the future)
	if blockTime.After(time.Now().Add(time.Hour)) {
		return fmt.Errorf("block timestamp is too far in the future")
	}

	// Validate gas limits
	gasLimitHex := strings.TrimPrefix(header["gasLimit"].(string), "0x")
	gasLimit, _ := new(big.Int).SetString(gasLimitHex, 16)

	gasUsedHex := strings.TrimPrefix(header["gasUsed"].(string), "0x")
	gasUsed, _ := new(big.Int).SetString(gasUsedHex, 16)

	// Check if gasUsed exceeds gasLimit
	if gasUsed.Cmp(gasLimit) > 0 {
		return fmt.Errorf("gas used exceeds gas limit")
	}

	// Validate difficulty (no exact length requirement)
	if err := validateHex(header["difficulty"].(string), "difficulty", 0); err != nil {
		return err
	}

	// Validate nonce
	if err := validateHex(header["nonce"].(string), "nonce", 16); err != nil {
		return err
	}

	// Validate logs bloom (256 bytes = 512 hex chars)
	if err := validateHex(header["logsBloom"].(string), "logsBloom", 512); err != nil {
		return err
	}

	// Validate block number
	if err := validateHex(header["number"].(string), "number", 0); err != nil {
		return err
	}

	// Extra data length validation
	extraData := strings.TrimPrefix(header["extraData"].(string), "0x")
	if len(extraData) == 0 {
		return fmt.Errorf("extra data cannot be empty")
	}

	// All validations passed
	return nil
}

// validateSnapshot performs validation checks on a Snapshot struct
func validateSnapshot(snap *bor.Snapshot) error {
	if snap == nil {
		return fmt.Errorf("snapshot is nil")
	}

	// Validate Recents
	if len(snap.Recents) == 0 {
		return fmt.Errorf("recents map is empty")
	}

	// Check recent addresses
	for blockNum, addr := range snap.Recents {
		if addr == (common.Address{}) {
			return fmt.Errorf("zero address found in recents at block %d", blockNum)
		}
	}

	// Validate ValidatorSet
	if snap.ValidatorSet == nil {
		return fmt.Errorf("validator set is nil")
	}

	if len(snap.ValidatorSet.Validators) == 0 {
		return fmt.Errorf("validators list is empty")
	}

	// Create a map to check for unique addresses
	addrMap := make(map[common.Address]bool)

	// Validate each validator
	err := validateValidators(snap.ValidatorSet.Validators, &addrMap)
	if err != nil {
		return err
	}

	// Validate Proposer
	if snap.ValidatorSet.Proposer == nil {
		return fmt.Errorf("proposer is nil")
	}

	// Check if proposer is one of the validators
	if !addrMap[snap.ValidatorSet.Proposer.Address] {
		return fmt.Errorf("proposer address %s not found in validator set", snap.ValidatorSet.Proposer.Address.Hex())
	}

	// All validations passed
	return nil
}

func validateValidators(validators []*valset.Validator, addrMap *map[common.Address]bool) error {
	// Create a map to check for unique IDs
	idMap := make(map[uint64]bool)

	for i, validator := range validators {
		// Check if validator is nil
		if validator == nil {
			return fmt.Errorf("validator at index %d is nil", i)
		}

		// Check ID uniqueness (commented out as per example showing all IDs as 0)
		if idMap[validator.ID] {
			return fmt.Errorf("duplicate validator ID found: %d", validator.ID)
		}
		idMap[validator.ID] = true

		// Check address validity
		if validator.Address == (common.Address{}) {
			return fmt.Errorf("validator at index %d has zero address", i)
		}

		// Check address uniqueness
		if (*addrMap)[validator.Address] {
			return fmt.Errorf("duplicate validator address found: %s", validator.Address.Hex())
		}
		(*addrMap)[validator.Address] = true

		// Check voting power
		if validator.VotingPower <= 0 {
			return fmt.Errorf("validator at index %d has non-positive voting power: %d", i, validator.VotingPower)
		}
	}
	return nil
}

// validateBlockSigners performs validation checks on a BlockSigners struct
func validateBlockSigners(bs *bor.BlockSigners) error {
	if bs == nil {
		return fmt.Errorf("block signers is nil")
	}

	// Validate Author address
	if bs.Author == (common.Address{}) {
		return fmt.Errorf("author address is zero")
	}

	// Validate Signers length matches Diff
	if len(bs.Signers) != bs.Diff {
		return fmt.Errorf("signers length (%d) does not match diff (%d)", len(bs.Signers), bs.Diff)
	}

	// Must have at least one signer
	if len(bs.Signers) == 0 {
		return fmt.Errorf("signers list is empty")
	}

	// Validate first signer
	if bs.Signers[0].Signer == (common.Address{}) {
		return fmt.Errorf("first signer address is zero")
	}

	// Validate first signer difficulty matches Diff
	if bs.Signers[0].Difficulty != uint64(bs.Diff) {
		return fmt.Errorf("first signer difficulty (%d) does not match diff (%d)",
			bs.Signers[0].Difficulty, bs.Diff)
	}

	// Validate author is first signer
	if bs.Author != bs.Signers[0].Signer {
		return fmt.Errorf("author (%s) is not the first signer (%s)",
			bs.Author.Hex(), bs.Signers[0].Signer.Hex())
	}

	// Validate remaining signers
	for i := 1; i < len(bs.Signers); i++ {
		// Check non-zero address
		if bs.Signers[i].Signer == (common.Address{}) {
			return fmt.Errorf("signer at position %d has zero address", i)
		}

		// Check difficulty is exactly one less than previous
		expectedDifficulty := bs.Signers[i-1].Difficulty - 1
		if bs.Signers[i].Difficulty != expectedDifficulty {
			return fmt.Errorf("invalid difficulty sequence at position %d: got %d, want %d",
				i, bs.Signers[i].Difficulty, expectedDifficulty)
		}
	}

	return nil
}

func validateStateSyncTxReceipt(receipt map[string]interface{}) error {
	// Validate from and to addresses are 0x0
	zeroAddress := "0x0000000000000000000000000000000000000000"

	from, ok := receipt["from"].(string)
	if !ok || !strings.EqualFold(from, zeroAddress) {
		return fmt.Errorf("invalid 'from' address: expected %s, got %s", zeroAddress, from)
	}

	to, ok := receipt["to"].(string)
	if !ok || !strings.EqualFold(to, zeroAddress) {
		return fmt.Errorf("invalid 'to' address: expected %s, got %s", zeroAddress, to)
	}

	// Validate gas values are 0
	if receipt["cumulativeGasUsed"] != "0x0" {
		return fmt.Errorf("cumulativeGasUsed must be 0x0")
	}

	if receipt["effectiveGasPrice"] != "0x0" {
		return fmt.Errorf("effectiveGasPrice must be 0x0")
	}

	if receipt["gasUsed"] != "0x0" {
		return fmt.Errorf("gasUsed must be 0x0")
	}

	// Validate logs contain required state sync log
	logs, ok := receipt["logs"].([]interface{})
	if !ok {
		return fmt.Errorf("invalid logs field")
	}

	stateSyncAddress := "0x0000000000000000000000000000000000001001"
	expectedTopic, err := hex.DecodeString("5a22725590b0a51c923940223f7458512164b1113359a735e86e7f27f44791ee")
	if err != nil {
		return fmt.Errorf("failed to decode expected topic: %v", err)
	}

	foundStateSyncLog := false
	for _, logInterface := range logs {
		logEvent, ok := logInterface.(map[string]interface{})
		if !ok {
			continue
		}

		address, ok := logEvent["address"].(string)
		if !ok || !strings.EqualFold(address, stateSyncAddress) {
			continue
		}

		topics, ok := logEvent["topics"].([]interface{})
		if !ok || len(topics) == 0 {
			continue
		}

		firstTopic, ok := topics[0].(string)
		if !ok {
			continue
		}

		// Remove "0x" prefix if present
		firstTopic = strings.TrimPrefix(firstTopic, "0x")
		topicBytes, err := hex.DecodeString(firstTopic)
		if err != nil {
			continue
		}

		if bytes.Equal(topicBytes, expectedTopic) {
			foundStateSyncLog = true
			break
		}
	}

	if !foundStateSyncLog {
		return fmt.Errorf("state sync log not found")
	}

	return nil
}

func handleGetStateSyncBlockReceipts(rm *ResponseMap, method string, txReceipts *[]map[string]interface{}) error {

	// state sync tx must always be the last one
	stateSyncTx := (*txReceipts)[len(*txReceipts)-1]

	err := validateStateSyncTxReceipt((*txReceipts)[len(*txReceipts)-1])
	if err != nil {
		return fmt.Errorf("last receipt on block must be state sync tx: %s", err)
	}
	txIndexHexStringWithoutPrefix := (stateSyncTx)["transactionIndex"].(string)[2:]
	txIndexOnMethod, err := strconv.ParseInt(txIndexHexStringWithoutPrefix, 16, 0)
	if err != nil {
		return fmt.Errorf("error converting hex to int:%s", err)
	}
	if int(txIndexOnMethod) != rm.stateSyncTxIndex {
		return fmt.Errorf("error on state sync tx index in block %s: transaction index on method %s: %d | transaction index on method eth_getTransactionReceipt: %d", rm.stateSyncBlockHash, method, txIndexOnMethod, rm.stateSyncTxIndex)
	}

	return nil
}

func validateHexBigInt(value interface{}, fieldName string, customValidation func(*big.Int) error) error {
	strValue, ok := value.(string)
	if !ok {
		return fmt.Errorf("invalid type for %s, expected string", fieldName)
	}

	// Ensure it starts with "0x"
	if len(strValue) < 3 || strValue[:2] != "0x" {
		return fmt.Errorf("%s must be a hex string prefixed with 0x", fieldName)
	}

	// Convert to big.Int
	bigValue, success := new(big.Int).SetString(strValue[2:], 16)
	if !success {
		return fmt.Errorf("invalid hex string for %s: %s", fieldName, strValue)
	}

	// Apply custom validation if provided
	if customValidation != nil {
		return customValidation(bigValue)
	}

	return nil
}

// ValidateCodeHash checks if the provided runtime code matches the account's codeHash
func ValidateCodeHash(runtimeCode []byte, accountResult *accountResult) error {
	calculatedCodeHash := crypto.Keccak256Hash(runtimeCode)

	if calculatedCodeHash != accountResult.CodeHash {
		return fmt.Errorf("code hash mismatch: calculated %s, account has %s",
			calculatedCodeHash.Hex(), accountResult.CodeHash.Hex())
	}
	return nil
}

func generateInputForDeployTestContract(key string, value *big.Int) []byte {
	abi, _ := testcontract.TestcontractMetaData.GetAbi()
	input, _ := abi.Pack("", key, value)

	return append(common.FromHex(testcontract.TestcontractMetaData.Bin), input...)
}

func generateInputForCallGetValue(key string) []byte {
	abi, _ := testcontract.TestcontractMetaData.GetAbi()
	input, _ := abi.Pack("getValue", key)
	return input
}

func generateRawTransaction(nonce uint64, gasLimit uint64, gasPrice *big.Int, data []byte, privateKey *ecdsa.PrivateKey, chainID *big.Int) string {
	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       nil,
		Value:    big.NewInt(0),
		Gas:      gasLimit,
		GasPrice: gasPrice,
		Data:     data,
	})
	signer := types.LatestSignerForChainID(chainID)
	signedTx, err := types.SignTx(tx, signer, privateKey)
	if err != nil {
		log.Fatalf("Failed to sign transaction: %v", err)
	}

	rawTxBytes, err := signedTx.MarshalBinary()
	if err != nil {
		log.Fatalf("Failed to marshal transaction: %v", err)
	}
	return fmt.Sprintf("0x%s", hex.EncodeToString(rawTxBytes))
}

// prepareEstimateGasRequest creates a new JSON-RPC request for estimating gas for an ETH transfer
func prepareEstimateGasRequest(from Account, input []byte) map[string]interface{} {
	// Prepare transaction parameters for gas estimation
	txParams := map[string]interface{}{
		"from":  from.addr.Hex(),
		"to":    nil,
		"value": "0x0",
		"input": fmt.Sprintf("0x%s", hex.EncodeToString(input)),
	}

	// Create and return the JSON-RPC request
	return txParams
}

var testCases = []TestCase{
	{
		Key: "eth_chainId",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_chainId", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			intValue, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}

			rm.chainId = intValue
			return nil
		},
	},
	{
		Key: "eth_blockNumber",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_blockNumber", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			intValue, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}
			rm.mostRecentBlockNumber = intValue
			return nil
		},
	},
	{
		Key: "eth_getTransactionCount",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getTransactionCount", []interface{}{rm.account.addr, "latest"}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			intValue, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}

			// set nonce for accounts[0]
			rm.account.nonce = intValue
			return nil
		},
	},
	{
		Key: "bor_getCurrentProposer",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getCurrentProposer", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			currentProposerAddress, err := parseResponse[common.Address](resp.Result)
			if err != nil {
				return err
			}
			if (*currentProposerAddress == common.Address{}) {
				return fmt.Errorf("invalid proposer address: %s", currentProposerAddress)
			}
			rm.currentProposerAddress = *currentProposerAddress
			return nil
		},
	},
	{
		Key: "bor_getCurrentValidators",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getCurrentValidators", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			validators, err := parseResponse[[]valset.Validator](resp.Result)
			if err != nil {
				return err
			}
			if len(*validators) == 0 {
				return fmt.Errorf("must be at least one validator")
			}
			// Create a map to check for unique addresses
			addrMap := make(map[common.Address]bool)
			validatorSet := make([]*valset.Validator, len(*validators))
			for i, validator := range *validators {
				validatorSet[i] = &validator
			}

			err = validateValidators(validatorSet, &addrMap)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "eth_getBlockByNumber",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getBlockByNumber", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockNumber), true}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			block, err := parseResponse[map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			err = validateBlock(*block)
			if err != nil {
				return err
			}
			blockHash, _ := (*block)["hash"].(string)
			parentHash, _ := (*block)["parentHash"].(string)
			rm.mostRecentBlockHash = common.HexToHash(blockHash)
			rm.mostRecentBlockParentHash = common.HexToHash(parentHash)
			return nil
		},
	},
	{
		Key: "eth_getBlockByHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			// requests most recent parent block
			return NewRequest("eth_getBlockByHash", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockParentHash), true}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			block, err := parseResponse[map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			err = validateBlock(*block)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "eth_getHeaderByNumber",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getHeaderByNumber", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockNumber)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			header, err := parseResponse[map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			err = validateHeader(*header)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "eth_getHeaderByHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getHeaderByHash", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockHash)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			header, err := parseResponse[map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			err = validateHeader(*header)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "eth_getBalance",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getBalance", []interface{}{rm.account.addr, "latest"}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			balance, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}

			if (*balance).Cmp(big.NewInt(0)) <= 0 {
				return fmt.Errorf("balance must be greater than 0")
			}
			return nil
		},
	},
	{
		Key: "eth_gasPrice",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_gasPrice", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			gasPrice, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}

			if (*gasPrice).Cmp(big.NewInt(0)) <= 0 {
				return fmt.Errorf("gas price must be greater than 0")
			}
			rm.gasPrice = gasPrice
			return nil
		},
	},
	{
		Key: "eth_maxPriorityFeePerGas",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_maxPriorityFeePerGas", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			priorityFeePerGas, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}

			if (*priorityFeePerGas).Cmp(big.NewInt(0)) < 0 {
				return fmt.Errorf("gas price must be equal or greater than 0")
			}
			return nil
		},
	},
	{
		Key: "eth_feeHistory",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_feeHistory", []interface{}{4, "latest", []int{25, 75}}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			feeHistory, err := parseResponse[feeHistoryResult](resp.Result)
			if err != nil {
				return err
			}
			if (*big.Int)(feeHistory.OldestBlock).Cmp(big.NewInt(0)) <= 0 {
				return fmt.Errorf("invalid oldest block: %s", (*big.Int)(feeHistory.OldestBlock).String())
			}

			// Check if Reward, BaseFee, and GasUsedRatio slices have consistent lengths
			expectedLength := len(feeHistory.Reward)
			if len(feeHistory.BaseFee) != expectedLength+1 {
				return fmt.Errorf("BaseFee length must be Reward length + 1: got %d, expected %d", len(feeHistory.BaseFee), expectedLength+1)
			}
			if len(feeHistory.GasUsedRatio) != expectedLength {
				return fmt.Errorf("GasUsedRatio length must match Reward length: got %d, expected %d", len(feeHistory.GasUsedRatio), expectedLength)
			}

			// Validate each BaseFee value is positive
			for i, fee := range feeHistory.BaseFee {
				if (*big.Int)(fee).Cmp(big.NewInt(0)) <= 0 {
					return fmt.Errorf("invalid BaseFeePerGas at index %d: %s", i, (*big.Int)(fee).String())
				}
			}

			// Validate GasUsedRatio values are within [0, 1]
			for i, ratio := range feeHistory.GasUsedRatio {
				if ratio < 0 || ratio > 1 {
					return fmt.Errorf("invalid GasUsedRatio at index %d: %f", i, ratio)
				}
			}

			// Validate Reward values are non-empty and positive
			for i, rewards := range feeHistory.Reward {
				if len(rewards) == 0 {
					return fmt.Errorf("empty Reward slice at index %d", i)
				}
				for j, reward := range rewards {
					if (*big.Int)(reward).Cmp(big.NewInt(0)) < 0 {
						return fmt.Errorf("negative Reward value at Reward[%d][%d]: %s", i, j, (*big.Int)(reward).String())
					}
				}
			}
			return nil
		},
	},
	{
		Key: "eth_syncing",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_syncing", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			isSyncing, err := parseResponse[bool](resp.Result)
			if err != nil {
				return err
			}
			if *isSyncing {
				return fmt.Errorf("should not be syncing")
			}
			return nil
		},
	},
	{
		Key: "bor_getAuthor (by number)",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getAuthor", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockNumber)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			address, err := parseResponse[common.Address](resp.Result)
			if err != nil {
				return err
			}
			if (*address == common.Address{}) {
				return fmt.Errorf("invalid author address")
			}
			return nil
		},
	},
	{
		Key: "bor_getAuthor (no params)",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getAuthor", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			address, err := parseResponse[common.Address](resp.Result)
			if err != nil {
				return err
			}
			if (*address == common.Address{}) {
				return fmt.Errorf("invalid author address")
			}
			return nil
		},
	},
	{
		Key: "bor_getAuthor (by hash)",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getAuthor", []interface{}{rm.mostRecentBlockParentHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			address, err := parseResponse[common.Address](resp.Result)
			if err != nil {
				return err
			}
			if (*address == common.Address{}) {
				return fmt.Errorf("invalid author address")
			}
			return nil
		},
	},
	{
		Key: "bor_getRootHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getRootHash", []interface{}{new(big.Int).Sub(rm.mostRecentBlockNumber, big.NewInt(20)), rm.mostRecentBlockNumber}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			rootHash, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			if len(*rootHash) != 64 {
				return fmt.Errorf("invalid root hash size")
			}
			return nil
		},
	},

	{
		Key: "Create Transaction Scenario: eth_estimateGas",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			txParams := prepareEstimateGasRequest(rm.account, generateInputForDeployTestContract(rm.expectedKeyToStoreInContract, rm.expectedValueToStoreInContract))
			return NewRequest("eth_estimateGas", []interface{}{txParams}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			estimatedGas, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}

			upperBound := new(big.Int).Add(rm.expectedGasToCreateTransaction, big.NewInt(5000))
			upperBoundCmp := (*estimatedGas).Cmp(upperBound)

			lowerBound := new(big.Int).Sub(rm.expectedGasToCreateTransaction, big.NewInt(5000))
			lowerBoundCmp := (*estimatedGas).Cmp(lowerBound)
			// gas estimation may vary accross environments
			if !(upperBoundCmp == -1 && lowerBoundCmp == 1) {
				return fmt.Errorf("invalid gas estimation: expected %s but actual is %s ", rm.expectedGasToCreateTransaction, estimatedGas)
			}
			return nil
		},
	},
	{
		Key: "bor_getSigners",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getSigners", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockNumber)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			signers, err := parseResponse[[]common.Address](resp.Result)
			if err != nil {
				return err
			}
			if len(*signers) == 0 {
				return fmt.Errorf("each block must have at least one signer")
			}
			return nil
		},
	},
	{
		Key: "bor_getSignersAtHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getSignersAtHash", []interface{}{rm.mostRecentBlockParentHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			signers, err := parseResponse[[]common.Address](resp.Result)
			if err != nil {
				return err
			}
			if len(*signers) == 0 {
				return fmt.Errorf("each block must have at least one signer")
			}
			return nil
		},
	},
	{
		Key: "bor_getSnapshot",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getSnapshot", []interface{}{fmt.Sprintf("0x%x", rm.mostRecentBlockNumber)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			snapshot, err := parseResponse[bor.Snapshot](resp.Result)
			if err != nil {
				return err
			}
			err = validateSnapshot(snapshot)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "bor_getSnapshotAtHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getSnapshotAtHash", []interface{}{rm.mostRecentBlockParentHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			snapshot, err := parseResponse[bor.Snapshot](resp.Result)
			if err != nil {
				return err
			}
			err = validateSnapshot(snapshot)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "bor_getSnapshotProposer",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getSnapshotProposer", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			address, err := parseResponse[common.Address](resp.Result)
			if err != nil {
				return err
			}
			if (*address == common.Address{}) {
				return fmt.Errorf("invalid proposer address")
			}
			return nil
		},
	},
	{
		Key: "bor_getSnapshotProposerSequence",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("bor_getSnapshotProposerSequence", []interface{}{}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			blockSigners, err := parseResponse[bor.BlockSigners](resp.Result)
			if err != nil {
				return err
			}
			err = validateBlockSigners(blockSigners)
			if err != nil {
				return err
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_fillTransaction",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			txParams := prepareEstimateGasRequest(rm.account, generateInputForDeployTestContract(rm.expectedKeyToStoreInContract, rm.expectedValueToStoreInContract))
			return NewRequest("eth_fillTransaction", []interface{}{txParams}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			transactionResult, err := parseResponse[SignTransactionResult](resp.Result)
			if err != nil {
				return err
			}
			if transactionResult.Tx.ChainId().Cmp(rm.chainId) != 0 {
				return fmt.Errorf("invalid chainid: expect %d received %d", rm.chainId, transactionResult.Tx.ChainId())
			}
			if transactionResult.Tx.Nonce() != rm.account.nonce.Uint64() {
				return fmt.Errorf("invalid nonce: expect %d received %d", rm.account.nonce.Uint64(), transactionResult.Tx.Nonce())
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getLogs",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			// Define the event topic for StateCommitted(uint256 indexed stateId, bool success)
			eventSignature := "StateCommitted(uint256,bool)"
			eventTopic := crypto.Keccak256Hash([]byte(eventSignature))

			address := common.HexToAddress("0x0000000000000000000000000000000000001001")

			fromBlock := new(big.Int).Sub(rm.mostRecentBlockNumber, big.NewInt(30000))
			if fromBlock.Cmp(big.NewInt(0)) == -1 {
				fromBlock = big.NewInt(0)
			}
			// Create the filter object
			filter := map[string]interface{}{
				"address":   address.Hex(),
				"topics":    [][]common.Hash{{eventTopic}},
				"fromBlock": fmt.Sprintf("0x%x", fromBlock),
				"toBlock":   fmt.Sprintf("0x%x", rm.mostRecentBlockNumber),
			}

			return NewRequest("eth_getLogs", []interface{}{filter}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			logs, err := parseResponse[[]types.Log](resp.Result)
			if err != nil {
				return err
			}
			if len(*logs) == 0 {
				return fmt.Errorf("must have at least one state sync event in this block range")
			}
			rm.stateSyncTxHash = (*logs)[len(*logs)-1].TxHash
			rm.stateSyncBlockHash = (*logs)[len(*logs)-1].BlockHash

			blockNumber := (int64)((*logs)[len(*logs)-1].BlockNumber)
			rm.stateSyncBlockNumber = big.NewInt(blockNumber)

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getTransactionReceipt",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			if (rm.stateSyncTxHash == common.Hash{}) {
				return nil, fmt.Errorf("no state sync tx given for request")
			}

			return NewRequest("eth_getTransactionReceipt", []interface{}{rm.stateSyncTxHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			stateSyncTxReceipt, err := parseResponse[map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			txIndexHexStringWithoutPrefix := (*stateSyncTxReceipt)["transactionIndex"].(string)[2:]
			txIndex, err := strconv.ParseInt(txIndexHexStringWithoutPrefix, 16, 0)
			if err != nil {
				return fmt.Errorf("error converting hex to int:%s", err)
			}
			rm.stateSyncTxIndex = int(txIndex)

			err = validateStateSyncTxReceipt(*stateSyncTxReceipt)
			if err != nil {
				return err
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getTransactionByHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			if (rm.stateSyncBlockHash == common.Hash{}) {
				return nil, fmt.Errorf("no state sync tx given for request")
			}

			return NewRequest("eth_getTransactionByHash", []interface{}{rm.stateSyncTxHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			tx, err := parseResponse[RPCTransaction](resp.Result)
			if err != nil {
				return err
			}

			method := "eth_getTransactionByHash"
			if int(*tx.TransactionIndex) != rm.stateSyncTxIndex {
				return fmt.Errorf("error on state sync tx index in block %s: transaction index on method %s: %d | transaction index on method eth_getTransactionReceipt: %d", rm.stateSyncBlockHash, method, int(*tx.TransactionIndex), rm.stateSyncTxIndex)
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getTransactionByBlockHashAndIndex",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			if (rm.stateSyncBlockHash == common.Hash{}) {
				return nil, fmt.Errorf("no state sync tx given for request")
			}

			return NewRequest("eth_getTransactionByBlockHashAndIndex", []interface{}{rm.stateSyncBlockHash, fmt.Sprintf("0x%x", rm.stateSyncTxIndex)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			tx, err := parseResponse[RPCTransaction](resp.Result)
			if err != nil {
				return err
			}

			method := "eth_getTransactionByBlockHashAndIndex"
			if int(*tx.TransactionIndex) != rm.stateSyncTxIndex {
				return fmt.Errorf("error on state sync tx index in block %s: transaction index on method %s: %d | transaction index on method eth_getTransactionReceipt: %d", rm.stateSyncBlockHash, method, int(*tx.TransactionIndex), rm.stateSyncTxIndex)
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getTransactionByBlockNumberAndIndex",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			if rm.stateSyncBlockNumber == nil {
				return nil, fmt.Errorf("no state sync tx given for request")
			}
			return NewRequest("eth_getTransactionByBlockNumberAndIndex", []interface{}{fmt.Sprintf("0x%x", rm.stateSyncBlockNumber), fmt.Sprintf("0x%x", rm.stateSyncTxIndex)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			tx, err := parseResponse[RPCTransaction](resp.Result)
			if err != nil {
				return err
			}

			method := "eth_getTransactionByBlockNumberAndIndex"
			if int(*tx.TransactionIndex) != rm.stateSyncTxIndex {
				return fmt.Errorf("error on state sync tx index in block %s: transaction index on method %s: %d | transaction index on method eth_getTransactionReceipt: %d", rm.stateSyncBlockHash, method, int(*tx.TransactionIndex), rm.stateSyncTxIndex)
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getTransactionReceiptsByBlock",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			if (rm.stateSyncBlockHash == common.Hash{}) {
				return nil, fmt.Errorf("no state sync tx given for request")
			}
			return NewRequest("eth_getTransactionReceiptsByBlock", []interface{}{rm.stateSyncBlockHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			txReceipts, err := parseResponse[[]map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}

			return handleGetStateSyncBlockReceipts(rm, "eth_getTransactionReceiptsByBlock", txReceipts)
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getBlockReceipts",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			if (rm.stateSyncBlockHash == common.Hash{}) {
				return nil, fmt.Errorf("no state sync tx given for request")
			}
			return NewRequest("eth_getBlockReceipts", []interface{}{rm.stateSyncBlockHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			txReceipts, err := parseResponse[[]map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			rm.stateSyncExpectedBlockTransactionCount = len(*txReceipts)

			err = handleGetStateSyncBlockReceipts(rm, "eth_getBlockReceipts", txReceipts)
			if err != nil {
				return err
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getBlockTransactionCountByNumber",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getBlockTransactionCountByNumber", []interface{}{fmt.Sprintf("0x%x", rm.stateSyncBlockNumber)}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			receivedCount, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}
			expectedCount := big.NewInt(int64(rm.stateSyncExpectedBlockTransactionCount))
			if expectedCount.Cmp(receivedCount) != 0 {
				return fmt.Errorf("invalid transaction count. expected: %s | received: %s", expectedCount, receivedCount)
			}

			return nil
		},
	},
	{
		Key: "StateSyncTx Scenario: eth_getBlockTransactionCountByHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getBlockTransactionCountByHash", []interface{}{rm.stateSyncBlockHash}), nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			parsed, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			receivedCount, err := hexStringToBigInt(*parsed)
			if err != nil {
				return err
			}
			expectedCount := big.NewInt(int64(rm.stateSyncExpectedBlockTransactionCount))
			if expectedCount.Cmp(receivedCount) != 0 {
				return fmt.Errorf("invalid transaction count. expected: %s | received: %s", expectedCount, receivedCount)
			}

			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_sendRawTransaction",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			rm.expectedRawTx = generateRawTransaction(
				rm.account.nonce.Uint64(),
				rm.expectedGasToCreateTransaction.Uint64(),
				rm.gasPrice,
				generateInputForDeployTestContract(rm.expectedKeyToStoreInContract, rm.expectedValueToStoreInContract),
				rm.account.key, rm.chainId)
			return NewRequest("eth_sendRawTransaction",
					[]interface{}{rm.expectedRawTx}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			txHash, err := parseResponse[common.Hash](resp.Result)
			if err != nil {
				return err
			}
			rm.pushedTxHash = *txHash

			// sleeps 30 seconds to wait until tx is available for next request
			time.Sleep(30 * time.Second)
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_createAccessList",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_createAccessList",
					[]interface{}{prepareEstimateGasRequest(rm.account, generateInputForDeployTestContract(rm.expectedKeyToStoreInContract, rm.expectedValueToStoreInContract))}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			accessListResult, err := parseResponse[accessListResult](resp.Result)
			if err != nil {
				return err
			}
			if len(*accessListResult.Accesslist) == 0 {
				return fmt.Errorf("should return at least on access list")
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getRawTransactionByHash",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getRawTransactionByHash",
					[]interface{}{rm.pushedTxHash}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			rawTx, err := parseResponse[hexutil.Bytes](resp.Result)
			if err != nil {
				return err
			}
			rawTxPrefixed := fmt.Sprintf("0x%s", hex.EncodeToString(*rawTx))
			if rawTxPrefixed != rm.expectedRawTx {
				return fmt.Errorf("invalid raw tx returned: expected %s , actual %s", rm.expectedRawTx, rawTxPrefixed)
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getTransactionReceipt",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getTransactionReceipt",
					[]interface{}{rm.pushedTxHash}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			txReceipt, err := parseResponse[map[string]interface{}](resp.Result)
			if err != nil {
				return err
			}
			if *txReceipt == nil {
				return fmt.Errorf("no transaction pushed")
			}

			rm.pushedTxBlockNumber, _ = hexStringToBigInt((*txReceipt)["blockNumber"].(string))
			rm.pushedTxBlockHash = common.HexToHash((*txReceipt)["blockHash"].(string))
			rm.pushedTxTransactionIndex, _ = hexStringToBigInt((*txReceipt)["transactionIndex"].(string))
			rm.pushedTxDeployedContractAddress = common.HexToAddress((*txReceipt)["contractAddress"].(string))
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getCode",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getCode",
					[]interface{}{rm.pushedTxDeployedContractAddress, "latest"}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			code, err := parseResponse[hexutil.Bytes](resp.Result)
			if err != nil {
				return err
			}
			codeCopy := make([]byte, len(*code))
			copy(codeCopy, *code)

			rm.pushedTxDeployedContractRuntimeCode = &codeCopy
			runtimeCode := fmt.Sprintf("0x%s", hex.EncodeToString(*code))
			// Check if the deployed bytecode is longer than the runtime code
			if len(testcontract.TestcontractMetaData.Bin) < len(runtimeCode) {
				return fmt.Errorf("deployed bytecode is shorter than runtime code")
			}

			// Compare the first 12 characters
			if len(runtimeCode) < 12 || len(testcontract.TestcontractMetaData.Bin) < 12 {
				return fmt.Errorf("bytecode is too short for the comparison")
			}
			if runtimeCode[:12] != testcontract.TestcontractMetaData.Bin[:12] {
				return fmt.Errorf("first 12 characters do not match")
			}

			// Check if the remaining runtime code matches the end of the deployed bytecode
			offset := len(testcontract.TestcontractMetaData.Bin) - len(runtimeCode[12:])
			if runtimeCode[12:] != testcontract.TestcontractMetaData.Bin[offset:] {
				return fmt.Errorf("remaining runtime code does not match the end of the deployed bytecode")
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_call",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			txParams := map[string]interface{}{
				"to":   fmt.Sprintf("%s", rm.pushedTxDeployedContractAddress),
				"data": fmt.Sprintf("0x%s", hex.EncodeToString(generateInputForCallGetValue(rm.expectedKeyToStoreInContract))),
			}
			return NewRequest("eth_call",
					[]interface{}{txParams, fmt.Sprintf("0x%x", rm.pushedTxBlockNumber)}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			hexStringStoredValue, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			value := new(big.Int)
			if _, success := value.SetString((*hexStringStoredValue)[2:], 16); !success {
				return fmt.Errorf("failed to convert hex string to big.Int")
			}
			if value.Cmp(rm.expectedValueToStoreInContract) != 0 {
				return fmt.Errorf("invalid returned value: expected %s , actual %s", rm.expectedValueToStoreInContract, value)
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getRawTransactionByBlockNumberAndIndex",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getRawTransactionByBlockNumberAndIndex",
					[]interface{}{fmt.Sprintf("0x%x", rm.pushedTxBlockNumber), fmt.Sprintf("0x%x", rm.pushedTxTransactionIndex)}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			rawTx, err := parseResponse[hexutil.Bytes](resp.Result)
			if err != nil {
				return err
			}
			rawTxPrefixed := fmt.Sprintf("0x%s", hex.EncodeToString(*rawTx))
			if rawTxPrefixed != rm.expectedRawTx {
				return fmt.Errorf("invalid raw tx returned: expected %s , actual %s", rm.expectedRawTx, rawTxPrefixed)
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getRawTransactionByBlockHashAndIndex",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getRawTransactionByBlockHashAndIndex",
					[]interface{}{rm.pushedTxBlockHash, fmt.Sprintf("0x%x", rm.pushedTxTransactionIndex)}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			rawTx, err := parseResponse[hexutil.Bytes](resp.Result)
			if err != nil {
				return err
			}
			rawTxPrefixed := fmt.Sprintf("0x%s", hex.EncodeToString(*rawTx))
			if rawTxPrefixed != rm.expectedRawTx {
				return fmt.Errorf("invalid raw tx returned: expected %s , actual %s", rm.expectedRawTx, rawTxPrefixed)
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getStorageAt",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getStorageAt",
					[]interface{}{rm.pushedTxDeployedContractAddress, "0x0", "latest"}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			hexStringOnSlot0, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}
			slot0Value := new(big.Int)
			if _, success := slot0Value.SetString((*hexStringOnSlot0)[2:], 16); !success {
				return fmt.Errorf("failed to convert hex string to big.Int")
			}
			if slot0Value.Cmp(rm.expectedSlot0Value) != 0 {
				return fmt.Errorf("invalid slot 0 returned : expected %s , actual %s", rm.expectedSlot0Value, slot0Value)
			}

			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getProof",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getProof",
					[]interface{}{rm.pushedTxDeployedContractAddress, []string{"0x0000000000000000000000000000000000000000000000000000000000000000"}, "latest"}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			accountResult, err := parseResponse[accountResult](resp.Result)
			if err != nil {
				return err
			}

			err = ValidateCodeHash(*rm.pushedTxDeployedContractRuntimeCode, accountResult)
			if err != nil {
				return err
			}

			if len(accountResult.AccountProof) == 0 {
				return fmt.Errorf("must not be an empty account proof array")
			}

			if len(accountResult.StorageProof) == 0 {
				return fmt.Errorf("must not be an empty storage proof array")
			}

			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_newFilter",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			eventSignature := "ContractDeployed()"
			eventTopic := crypto.Keccak256Hash([]byte(eventSignature))
			if rm.pushedTxBlockNumber == nil {
				return nil, fmt.Errorf("no block number given to prepare request")
			}
			params := map[string]interface{}{
				"fromBlock": fmt.Sprintf("0x%x", rm.pushedTxBlockNumber.Sub(rm.pushedTxBlockNumber, big.NewInt(1))),
				"toBlock":   fmt.Sprintf("0x%x", rm.pushedTxBlockNumber.Add(rm.pushedTxBlockNumber, big.NewInt(1))),
				"address":   rm.pushedTxDeployedContractAddress,
				"topics":    [][]common.Hash{{eventTopic}},
			}
			return NewRequest("eth_newFilter",
					[]interface{}{params}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			filterId, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}

			rm.filterId = *filterId
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_newBlockFilter",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_newBlockFilter",
					[]interface{}{}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			blockFilterId, err := parseResponse[string](resp.Result)
			if err != nil {
				return err
			}

			rm.blockFilterId = *blockFilterId
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getFilterChanges (from eth_newFilter)",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getFilterChanges",
					[]interface{}{rm.filterId}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			events, err := parseResponse[[]interface{}](resp.Result)
			if err != nil {
				return err
			}

			if len(*events) == 0 {
				return fmt.Errorf("must be at least one event")
			}
			return nil
		},
	},
	{
		Key: "Create Transaction Scenario: eth_getFilterChanges (from eth_newBlockFilter)",
		PrepareRequest: func(rm *ResponseMap) (*Request, error) {
			return NewRequest("eth_getFilterChanges",
					[]interface{}{rm.blockFilterId}),
				nil
		},
		HandleResponse: func(rm *ResponseMap, resp Response) error {
			events, err := parseResponse[[]interface{}](resp.Result)
			if err != nil {
				return err
			}

			if len(*events) == 0 {
				return fmt.Errorf("must be at least one event")
			}
			return nil
		},
	},
}
