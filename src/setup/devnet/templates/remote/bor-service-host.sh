#!/usr/bin/env sh

NODE_DIR=$HOME/node
BOR_HOME=/var/lib/bor
BIN_DIR=$(go env GOPATH)/bin
USER=$(whoami)
source $HOME/.nvm/nvm.sh
NODE=$(nvm which node)
GO=$(go env GOROOT)/bin
PATH=$NODE:$BIN_DIR:$GO:$PATH

VALIDATOR_ADDRESS="`cat $NODE_DIR/bor/address.txt`"

FLAG=$1

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

if [ "$FLAG" = "config" ]
then
cat > bor.service <<EOF
[Unit]
  Description=bor
  StartLimitIntervalSec=500
  StartLimitBurst=5
[Service]
  Restart=on-failure
  RestartSec=5s
  WorkingDirectory=$NODE_DIR
  Environment=PATH=$PATH
  EnvironmentFile=$HOME/metadata
  #ExecStartPre=/bin/bash $NODE_DIR/bor-setup.sh
  ExecStart=/bin/bash $NODE_DIR/bor-start-config.sh
  Type=simple
  User=$USER
  KillSignal=SIGINT
  TimeoutStopSec=120
[Install]
  WantedBy=multi-user.target
EOF
else
cat > bor.service <<EOF
[Unit]
  Description=bor
  StartLimitIntervalSec=500
  StartLimitBurst=5
[Service]
  Restart=on-failure
  RestartSec=5s
  WorkingDirectory=$NODE_DIR
  Environment=PATH=$PATH
  EnvironmentFile=$HOME/metadata
  #ExecStartPre=/bin/bash $NODE_DIR/bor-setup.sh
  ExecStart=/bin/bash $NODE_DIR/bor-start.sh $VALIDATOR_ADDRESS
  Type=simple
  User=$USER
  KillSignal=SIGINT
  TimeoutStopSec=120
[Install]
  WantedBy=multi-user.target
EOF
fi

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
