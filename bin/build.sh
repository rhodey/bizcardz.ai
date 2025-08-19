#!/bin/bash
set -e

# server
docker build -f server/Dockerfile.async1 -t bzbot-async1 ./server/
docker build -f server/Dockerfile.async2 -t bzbot-async2 ./server/
docker build -f server/Dockerfile -t bzbot ./server/

# webapp
docker build -f Dockerfile -t bzweb .
docker build -f Dockerfile.nginx -t bzhttp .
