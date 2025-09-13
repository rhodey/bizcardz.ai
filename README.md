# bizcardz.ai
[bizcardz.ai](https://bizcardz.ai) is a website where you design business cards which are converted to KiCad PCB schematics which can be manufactured (using metals) by companies such as Elecrow and PCBWay

![readme.gif](assets/readme.gif)

[more](assets/img/faq-all.jpg) [pics](assets/img/faq-black-silver.jpg) [are](assets/img/faq-black-gold.jpg) [he](assets/img/faq-white-silver.jpg) [re](assets/img/faq-white-gold.jpg)

## Config
You will need a Tier 1 [Google Gemini](https://aistudio.google.com/prompts/new_chat?model=gemini-2.5-flash-lite) API Key and you will need a [Replicate](https://replicate.com/ideogram-ai/ideogram-v2-turbo) API Key
```
cp example.env .env
```

## Dev
Online at [localhost:8080](http://localhost:8080)
```
./bin/build.sh
docker compose up server reload http
```

## Cli
If you have images and want PCB files and to not use the site:

Inside /your/dir should be front.png and back.png and the dimens should be a multiple of 2048x1152:
```
./bin/build.sh
docker run --rm -it --entrypoint=/app/cli.sh -v /your/dir:/app/cli bzbot --black --gold
> wrote bizcardz.zip
```

## License
This software is available under two licenses:

MIT: non-commercial use

Proprietary: commercial use, contact for terms

Copyright 2025 - hello@bizcardz.ai
