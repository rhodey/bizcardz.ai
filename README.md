# bizcardz.ai
[bizcardz.ai](https://bizcardz.ai) is a website where you design business cards which are converted to KiCad PCB schematics which can be manufactured (using metals) by companies such as Elecrow and PCBWay

![readme.gif](assets/readme.gif)

[more](assets/img/faq-all.jpg) [pics](assets/img/faq-black-silver.jpg) [are](assets/img/faq-black-gold.jpg) [he](assets/img/faq-white-silver.jpg) [re](assets/img/faq-white-gold.jpg)

## Config
In prod [Groq](https://console.groq.com/docs/models) (not Grok) is used because they are about 40% faster than openai & gemini

You may choose to skip use of Groq by setting env `openai_as_groq=true`
+ [OpenAI](https://platform.openai.com/docs/models/gpt-4o) - svg guidance - gpt-4o
+ [Gemini](https://aistudio.google.com/prompts/new_chat?model=gemini-2.0-flash) - svg ranking - gemini-2.0-flash
+ [Replicate](https://replicate.com/ideogram-ai/ideogram-v2-turbo) - image generation - ideogram-v2a-turbo
+ [Groq](https://console.groq.com/docs/models) - svg generation - llama-3.3-70b-versatile

## Dev
Online at [localhost:8080](http://localhost:8080)
```
./bin/build.sh
cp example.env .env
docker compose up server reload http
```

## Cli
If you already have images and want PCB files and to not use the site

Inside /your/dir should be front.png and back.png and the dimens should be a multiple of 2048x1152
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
