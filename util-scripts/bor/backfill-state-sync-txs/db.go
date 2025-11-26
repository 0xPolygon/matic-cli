package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

// WriteMissingStateSyncTransactions reads the missing StateSyncTxs from file and write on the data path
func WriteMissingStateSyncTransactions(dataPath string, txFile string) {
	// Open the file for reading
	file, err := os.Open(txFile)
	if err != nil {
		fmt.Errorf("failed to open file %s: %w", txFile, err)
	}
	defer file.Close()

	// Read all bytes from the file
	data, err := io.ReadAll(file)
	if err != nil {
		fmt.Errorf("failed to read file %s: %w", txFile, err)
	}

	// Unmarshal JSON into the same struct type
	var instructions []WriteInstruction
	if err := json.Unmarshal(data, &instructions); err != nil {
		fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	fmt.Printf("Found %d instructions to write on db", len(instructions))
	DebugWriteKey(dataPath, instructions)
}
