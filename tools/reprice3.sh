#!/bin/zsh
# Переоценка БЕЗ референсных изображений — они выключены по умолчанию.
export OPENROUTER_API_KEY="$OPENROUTER_API_KEY"
run () {
  node tools/forge.mjs "an armoured octopus" --model=$2 --style=machine \
    --slug=$1 --repairs=2 --hardonly ${=3} 2>&1 \
    | grep -E "^  (cost|tokens|style)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run ni-gem google/gemini-3.7-flash    &
run ni-hai anthropic/claude-haiku-4.5 &
run ni-son anthropic/claude-sonnet-5  &
run ni-opu anthropic/claude-opus-5    &
run ni-glm z-ai/glm-5.3         "--think=8000 --maxtok=100000" &
run ni-kim moonshotai/kimi-k3   "--think=8000 --maxtok=100000" &
run ni-qwn qwen/qwen3.8-max     "--think=8000 --maxtok=100000" &
wait
echo REPRICE3 DONE
