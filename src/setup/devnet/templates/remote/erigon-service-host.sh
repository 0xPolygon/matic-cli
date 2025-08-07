#!/usr/bin/env sh

NODE_DIR=$HOME/node
ERIGON_HOME=$HOME/.erigon
BIN_DIR=$(go env GOPATH)/bin
USER=$(whoami)
source $HOME/.nvm/nvm.sh
NODE=$(nvm which node)
GO=$(go env GOROOT)/bin
PATH=$NODE:$BIN_DIR:$GO:$PATH

VALIDATOR_ADDRESS="`cat $ERIGON_HOME/address.txt`"

cat > metadata <<EOF
VALIDATOR_ADDRESS=
EOF

cat > anvil.service <<EOF
[Unit]
    Description=anvil
[Service]
    WorkingDirectory=$HOME
    Environment=PATH=$PATH
    ExecStart=/bin/bash $HOME/anvil-start.sh
    User=ubuntu
    Type=simple
    KillSignal=SIGINT
EOF

cat > erigon.service <<EOF
[Unit]
  Description=erigon
  StartLimitIntervalSec=500
  StartLimitBurst=5
[Service]
  Restart=on-failure
  RestartSec=5s
  WorkingDirectory=$NODE_DIR
  Environment=PATH=$PATH
  EnvironmentFile=$HOME/metadata
  ExecStart=/bin/bash $NODE_DIR/erigon-start.sh
  Type=simple
  User=$USER
  KillSignal=SIGINT
  TimeoutStopSec=120
[Install]
  WantedBy=multi-user.target
EOF

cat > heimdalld.service <<EOF
[Unit]
  Description=heimdalld
[Service]
  WorkingDirectory=$NODE_DIR
  ExecStart=$BIN_DIR/heimdalld start --home /var/lib/heimdall --chain=/var/lib/heimdall/config/genesis.json --api.address "tcp://0.0.0.0:1317" --bridge --all --rest-server
  Type=simple
  User=$USER
[Install]
  WantedBy=multi-user.target
EOF

cat > heimdalld-rest-server.service <<EOF
[Unit]
  Description=heimdalld-rest-server
[Service]
  WorkingDirectory=$NODE_DIR
  ExecStart=$BIN_DIR/heimdalld rest-server
  Type=simple
  User=$USER
[Install]
  WantedBy=multi-user.target
EOF

cat > heimdalld-bridge.service <<EOF
[Unit]
  Description=heimdalld-bridge
[Service]
  WorkingDirectory=$NODE_DIR
  ExecStart=$BIN_DIR/bridge start --all
  Type=simple
  User=$USER
[Install]
  WantedBy=multi-user.target
EOF
