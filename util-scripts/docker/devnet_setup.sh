#!/bin/bash

# Run the devnet - Consolidated script

# Start Anvil
bash docker-anvil-start.sh || { echo "Failed to start Anvil"; exit 1; }

# Start Heimdall
bash docker-heimdall-start-all.sh || { echo "Failed to start Heimdall"; exit 1; }

# Setup Bor
bash docker-bor-setup.sh || { echo "Failed to setup Bor"; exit 1; }

# Start Bor
bash docker-bor-start-all.sh || { echo "Failed to start Bor"; exit 1; }

sleep 2m

# Deploy contracts on Bor
bash anvil-deployment-bor.sh || { echo "Failed to deploy contracts on Bor"; exit 1; }

# Sync Bor contracts deployment
bash anvil-deployment-sync.sh || { echo "Failed to sync Bor contracts deployment"; exit 1; }

echo "Devnet setup complete."
