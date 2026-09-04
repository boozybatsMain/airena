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

# Останов по деньгам: перед каждым запросом смотрим остаток и не лезем ниже $2.
floor_ok () {
  local left=$(curl -s -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    https://openrouter.ai/api/v1/credits \
    | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];print(round(d['total_credits']-d['total_usage'],2))" 2>/dev/null)
  [ -z "$left" ] && { echo "!! баланс не прочитался — стоп"; return 1; }
  echo "   остаток \$$left"
  python3 -c "import sys;sys.exit(0 if $left > 2.0 else 1)"
}

# Ждём, пока доработает GLM-осьминог, запущенный до паузы.
while pgrep -f "orbrain.mjs --model=z-ai" >/dev/null; do sleep 20; done

for M in z-ai/glm-5.3 deepseek/deepseek-v4-pro qwen/qwen3.8-max; do
  for F in octopus gorilla; do
    [ "$M/$F" = "z-ai/glm-5.3/octopus" ] && continue   # уже сделан
    floor_ok || { echo "СТОП: остаток ниже \$2"; exit 3; }
    node tools/orbrain.mjs --model=$M --fighter=$F 2>&1 | tail -1
  done
done
echo CHEAP DONE
