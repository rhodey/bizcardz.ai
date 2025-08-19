#!/bin/bash
set -e

# server
sudo docker build -f server/Dockerfile.async1 -t bzbot-async1:latest ./server/
aws ecr get-login-password --region us-east-2 | sudo docker login --username AWS --password-stdin 768110578177.dkr.ecr.us-east-2.amazonaws.com
sudo docker tag bzbot-async1:latest 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzbot-async1:latest
sudo docker push 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzbot-async1:latest

sudo docker build -f server/Dockerfile.async2 -t bzbot-async2:latest ./server/
aws ecr get-login-password --region us-east-2 | sudo docker login --username AWS --password-stdin 768110578177.dkr.ecr.us-east-2.amazonaws.com
sudo docker tag bzbot-async2:latest 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzbot-async2:latest
sudo docker push 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzbot-async2:latest

sudo docker build -f server/Dockerfile -t bzbot:latest ./server/
aws ecr get-login-password --region us-east-2 | sudo docker login --username AWS --password-stdin 768110578177.dkr.ecr.us-east-2.amazonaws.com
sudo docker tag bzbot:latest 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzbot:latest
sudo docker push 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzbot:latest

# bundle
sudo docker build -f Dockerfile -t bzweb .
sudo docker run --rm -it --entrypoint=/app/dist.sh -v ./dist:/app/dist bzweb

# nginx
sudo docker build -f Dockerfile.nginx -t bzhttp:latest .
aws ecr get-login-password --region us-east-2 | sudo docker login --username AWS --password-stdin 768110578177.dkr.ecr.us-east-2.amazonaws.com
sudo docker tag bzhttp:latest 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzhttp:latest
sudo docker push 768110578177.dkr.ecr.us-east-2.amazonaws.com/bzhttp:latest
