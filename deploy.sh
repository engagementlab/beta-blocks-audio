#!/bin/bash

# Require arg
if [  $# -eq 0 ]; then
    echo "Must run script w/ one arg, either 'qa' or 'prod'"
    exit 1
fi

# Source/load nvm
[[ -s $HOME/.nvm/nvm.sh ]] && . $HOME/.nvm/nvm.sh;

# Client
cd client; 
# bash ./toggledowntime.sh start; 

nvm use;
npm i;

pm2 stop 'beta-blocks-audio-client'; 

if [ "$1" == "prod" ]; then
    npm run build;
else
    npm run build-qa;
fi

pm2 start 'beta-blocks-audio-client';

# Server
cd ../server;
nvm use;
npm i;
pm2 restart 'beta-blocks-audio-server';