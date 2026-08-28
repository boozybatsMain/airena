#!/bin/zsh
# Переоценка каталога в БОЕВОМ режиме: домашний стиль, один проход,
# ремонт только если тело не собирается. Именно так мы и будем генерировать.
export OPENROUTER_API_KEY="$OPENROUTER_API_KEY"
run () {
  node tools/forge.mjs "an armoured octopus" --model=$2 --style=machine \
    --slug=$1 --repairs=2 --hardonly 2>&1 \
    | grep -E "^  (cost|tokens)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run rp-gem  google/gemini-3.7-flash    &
run rp-hai  anthropic/claude-haiku-4.5 &
run rp-son  anthropic/claude-sonnet-5  &
wait
echo REPRICE DONE
