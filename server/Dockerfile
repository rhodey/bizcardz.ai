FROM ghcr.io/inti-cmnb/kicad8_auto:1.8.3

EXPOSE 8081

RUN apt update
RUN apt install -y nodejs npm jq unzip
RUN apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

RUN apt install -y python3-pip
RUN apt install -y libvips42 libpotrace-dev potrace
RUN ln -s /usr/bin/python3 /usr/bin/python

COPY python/lib /app/python/lib
WORKDIR /app/python/lib/potracecffi
RUN pip3 install --break-system-packages pyvips numpy gdstk
RUN pip3 install --break-system-packages .

WORKDIR /app
COPY assets/ assets/

COPY package.json .
COPY package-lock.json .
RUN npm install

WORKDIR /app/python
COPY python/kicad.py .

WORKDIR /app
RUN mkdir /app/js

COPY js/sql.js js/
COPY js/metrics.js js/
COPY js/fonts.js js/
COPY js/favorites.js js/
COPY js/backgrounds.js js/
COPY js/server.js js/

COPY bin/cli.sh /app
RUN chmod +x /app/cli.sh

COPY js/kicad.js js/
COPY js/cli.js js/

CMD ["node", "js/server.js"]
