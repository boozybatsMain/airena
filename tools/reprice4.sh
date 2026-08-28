#!/bin/zsh
# Добор троих: Opus и Kimi упёрлись в десятиминутную стену forge, Haiku не
# записался. Запускаем поодиночке, чтобы не делить пропускную способность.
export OPENROUTER_API_KEY="$OPENROUTER_API_KEY"
run () {
  node tools/forge.mjs "an armoured octopus" --model=$2 --style=machine \
    --slug=$1 --repairs=2 --hardonly ${=3} 2>&1 \
    | grep -E "^  (cost|tokens)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run ni-hai anthropic/claude-haiku-4.5
run ni-opu anthropic/claude-opus-5
run ni-kim moonshotai/kimi-k3 "--think=8000 --maxtok=100000"
echo REPRICE4 DONE
