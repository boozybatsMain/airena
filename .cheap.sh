#!/bin/zsh
export OPENROUTER_API_KEY='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'

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
