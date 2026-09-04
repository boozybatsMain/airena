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
for M in moonshotai/kimi-k3 z-ai/glm-5.3 deepseek/deepseek-v4-pro x-ai/grok-4.6 openai/gpt-5.6-sol qwen/qwen3.8-max; do
  for F in octopus gorilla; do
    node tools/orbrain.mjs --model=$M --fighter=$F 2>&1 | tail -1
  done
done
echo FRONTIER DONE
