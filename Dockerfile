FROM alpine:3.20

RUN apk add --no-cache nodejs npm
WORKDIR /app

COPY package.json /app
COPY package-lock.json /app
RUN npm install

COPY bin/dist.sh /app
RUN chmod +x /app/dist.sh

WORKDIR /app
COPY assets/ /app/assets
COPY index.html /app/
COPY src/ /app/src

CMD ["npm", "run", "dev"]
