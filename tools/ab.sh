#!/bin/zsh
# A/B протокола ремонта, парами и параллельно.
#
# Пара blind+sighted на ОДНОМ промпте запускается одновременно: так обе
# половины видят одинаковую загрузку сети и одинаковое время суток, а не
# сравниваются через два часа друг от друга.
#
# Обрыв сети — не результат, а помеха: повторяем до RETRIES раз.
MODEL=${MODEL:-anthropic/claude-sonnet-5}
TAG=${TAG:-son}
RETRIES=${RETRIES:-2}

# Потолок вывода у CLI по умолчанию 64 000 токенов, и он считает размышление
# вместе с кодом. Замеренные запросы просят 60–104 тысячи, то есть упираются
# в него регулярно: прогон рубится на полуслове и выглядит как «сошлось
# дешевле», хотя он просто упал. Поднимаем, иначе меряем не протокол, а потолок.
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=${CLAUDE_CODE_MAX_OUTPUT_TOKENS:-160000}

one () {                       # $1=slug $2=prompt $3=extra-flags
  local slug=$1 prompt=$2 extra=$3 try=0
  [ -f "forge/$slug.json" ] && { echo "· $slug уже есть"; return; }
  while [ $try -le $RETRIES ]; do
    local out
    out=$(node tools/forge.mjs "$prompt" --lane=cli --model=$MODEL --slug=$slug --repairs=2 ${=extra} 2>&1)
    if [ -f "forge/$slug.json" ]; then
      echo "✓ $slug"; echo "$out" | grep -E "^  (cost|tokens)|handed back" | sed 's/^/    /'
      return
    fi
    try=$((try+1))
    echo "… $slug попытка $try не дошла: $(echo "$out" | grep -oE 'forge failed: .*' | head -1)"
  done
  echo "✗ $slug — не получилось за $((RETRIES+1)) попыток"
}

PROMPTS=("a shark with sharp teeth" "a heavy gorilla" "an armoured octopus" "a horned beetle")
for i in 1 2 3 4; do
  P=$PROMPTS[$i]
  one "ab-$TAG-blind-$i"   "$P" "--blind" &
  one "ab-$TAG-sighted-$i" "$P" ""        &
  wait
  echo "── пара $i готова ──"
done
echo "AB DONE $TAG"
