package main

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"log"
	"path/filepath"

	"github.com/cockroachdb/pebble"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/rlp"
	"github.com/ethereum/go-ethereum/rpc"
)

type ReceiptJustLogs struct {
	Logs []*types.Log `json:"logs"              gencodec:"required"`
}

var (
	borTxLookupPrefix = []byte(borTxLookupPrefixStr)
	borReceiptPrefix  = []byte("matic-bor-receipt-") // borReceiptPrefix + number + block hash -> bor block receipt

)

const (
	borTxLookupPrefixStr = "matic-bor-tx-lookup-"
)

// DebugEncodeBorReceiptKey encodes a bor receipt key for debugging (empty implementation)
func DebugEncodeBorReceiptKey(number uint64, blockHashString string, shouldPrint bool) string {
	blockHashString = blockHashString[2:]
	hash := common.HexToHash(blockHashString)
	enc := make([]byte, 8)
	binary.BigEndian.PutUint64(enc, number)

	bytesKey := append(append(borReceiptPrefix, enc...), hash.Bytes()...)
	output := fmt.Sprintf("0x%s", common.Bytes2Hex(bytesKey))
	if shouldPrint {
		fmt.Println(output)
	}
	return output

}

// DebugEncodeBorTxLookupEntry encodes a bor transaction lookup entry for debugging (empty implementation)
func DebugEncodeBorTxLookupEntry(hashString string, shouldPrint bool) string {
	hashString = hashString[2:]

	hash := common.HexToHash(hashString)
	bytesKey := append(borTxLookupPrefix, hash.Bytes()...)

	output := fmt.Sprintf("0x%s", common.Bytes2Hex(bytesKey))
	if shouldPrint {
		fmt.Println(output)
	}
	return output
}

// DebugEncodeBorReceiptValue queries the TX receipt by hash and hex encode it encodes the recept to byte value to be stored on db
func DebugEncodeBorReceiptValue(hashString string, remoteRPCUrl string, shouldPrint bool) string {
	hashString = hashString[2:]
	txHash := common.HexToHash(hashString)

	ctx := context.Background()
	// Connect to the RPC server
	client, err := rpc.DialContext(ctx, remoteRPCUrl)
	if err != nil {
		fmt.Printf("failed to connect to RPC %s: %w\n", remoteRPCUrl, err)
		return ""
	}
	defer client.Close()

	// Prepare the variable to hold the parsed receipt
	var receiptJustLogs *ReceiptJustLogs

	// Call eth_getTransactionReceipt and unmarshal into the Receipt struct
	err = client.CallContext(ctx, &receiptJustLogs, "eth_getTransactionReceipt", txHash)
	if err != nil {
		fmt.Printf("failed to get receipt for %s: %w\n", txHash, err)
		return ""
	}
	if shouldPrint {
		fmt.Printf("%d\n\n", len(receiptJustLogs.Logs))
	}

	bytes, err := rlp.EncodeToBytes(&types.ReceiptForStorage{
		Status: types.ReceiptStatusSuccessful, // make receipt status successful
		Logs:   receiptJustLogs.Logs,
	})
	if err != nil {
		fmt.Printf("Failed to encode bor receipt", "err", err)
	}

	output := fmt.Sprintf("0x%s", common.Bytes2Hex(bytes))
	if shouldPrint {
		fmt.Printf("\n\nEncoded Bor Receipt:\n\n%s\n", output)
	}
	return output
}

// DebugDeleteKey deletes a key in the data store for debugging (empty implementation)
func DebugDeleteKey(dataPath string, key string) {
	key = key[2:]

	// Path to Pebble database (chaindata) under the data directory
	dbPath := filepath.Join(dataPath, "bor", "chaindata")
	db, err := pebble.Open(dbPath, &pebble.Options{})
	if err != nil {
		log.Fatalf("Failed to open Pebble DB at %s: %v", dbPath, err)
	}
	defer db.Close()

	// Decode hex-encoded key
	keyBytes, err := hex.DecodeString(key)
	if err != nil {
		log.Fatalf("Invalid hex key %s: %v", key, err)
	}

	// Read value
	err = Delete(db, keyBytes)
	if err != nil {
		if err == pebble.ErrNotFound {
			fmt.Printf("Key %s not found in database\n", key)
			return
		}
		log.Fatalf("Error deleting key %s: %v", key, err)
	}
	fmt.Printf("Successfully deleted the key\n")
}

// DebugReadKey reads a key from the offline Pebble database.
func DebugReadKey(dataPath string, key string) {
	key = key[2:]

	// Path to Pebble database (chaindata) under the data directory
	dbPath := filepath.Join(dataPath, "bor", "chaindata")
	db, err := pebble.Open(dbPath, &pebble.Options{})
	if err != nil {
		log.Fatalf("Failed to open Pebble DB at %s: %v", dbPath, err)
	}
	defer db.Close()

	// Decode hex-encoded key
	keyBytes, err := hex.DecodeString(key)
	if err != nil {
		log.Fatalf("Invalid hex key %s: %v", key, err)
	}

	// Read value
	value, err := Get(db, keyBytes)
	if err != nil {
		if err == pebble.ErrNotFound {
			fmt.Printf("Key %s not found in database\n", key)
			return
		}
		log.Fatalf("Error reading key %s: %v", key, err)
	}

	// Print value in hex
	fmt.Printf("\n\nValue found on key:\n0x%x\n", value)
}

func DebugWriteKey(dataPath string, writeInstructions []WriteInstruction) {

	// Path to Pebble database (chaindata) under the data directory
	dbPath := filepath.Join(dataPath, "bor", "chaindata")
	db, err := pebble.Open(dbPath, &pebble.Options{})
	if err != nil {
		log.Fatalf("Failed to open Pebble DB at %s: %v", dbPath, err)
	}
	defer db.Close()

	batch := db.NewBatch()
	for _, instruction := range writeInstructions {
		key := instruction.Key
		value := instruction.Value

		key = key[2:]
		value = value[2:]

		// Decode hex-encoded key
		keyBytes, err := hex.DecodeString(key)
		if err != nil {
			log.Fatalf("Invalid hex key %s: %v", key, err)
		}

		// Decode hex-encoded key
		valueBytes, err := hex.DecodeString(value)
		if err != nil {
			log.Fatalf("Invalid hex value %s: %v", key, err)
		}

		// Read value
		err = PutBatch(batch, keyBytes, valueBytes)
		if err != nil {
			if err == pebble.ErrNotFound {
				fmt.Printf("Key %s not found in database\n", key)
				return
			}
			log.Fatalf("Error reading key %s: %v", key, err)
		}
	}

	if err := WriteBatch(batch); err != nil {
		log.Fatalf("Error writing keys: %v", err)
	}

	// Print value in hex
	fmt.Printf("Successfully write the keys\n")
}

func Get(db *pebble.DB, key []byte) ([]byte, error) {
	dat, closer, err := db.Get(key)
	if err != nil {
		return nil, err
	}

	ret := make([]byte, len(dat))
	copy(ret, dat)
	if err = closer.Close(); err != nil {
		return nil, err
	}
	return ret, nil
}

// Put inserts the given value into the key-value store.
func Put(db *pebble.DB, key []byte, value []byte) error {
	return db.Set(key, value, pebble.Sync)
}

func PutBatch(batch *pebble.Batch, key []byte, value []byte) error {
	return batch.Set(key, value, nil)
}

func WriteBatch(batch *pebble.Batch) error {
	return batch.Commit(pebble.Sync)
}

// Delete removes the key from the key-value store.
func Delete(db *pebble.DB, key []byte) error {
	return db.Delete(key, pebble.Sync)
}
