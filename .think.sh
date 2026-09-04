#!/bin/zsh
# Ключ читается из `.env`, а не лежит здесь литералом.
#
# Почему: `genex publish` открывает репозиторий исходника на чтение всем — на
# этом работает Remix, — а из пуша исключается только `.env`. Литерал в этом
# файле уехал в публичный клон 04.09 и был отозван. Больше сюда не возвращать.
if [ ! -f "${0:a:h}/.env" ]; then
  echo "!! нет .env рядом со скриптом — положи туда OPENROUTER_API_KEY=..." >&2
  exit 1
fi
set -a; . "${0:a:h}/.env"; set +a
node tools/orbrain.mjs --model=z-ai/glm-5.3        --fighter=gorilla --think=8000 --timeout=420
for M in moonshotai/kimi-k3 qwen/qwen3.8-max; do
  for F in octopus gorilla; do
    node tools/orbrain.mjs --model=$M --fighter=$F --think=8000 --timeout=420
  done
done
echo THINK DONE
