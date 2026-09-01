#!/bin/zsh
# ТЕПЕРЬ С ДОМАШНИМ СТИЛЕМ. Все прежние прогоны шли на --style=raw по умолчанию,
# то есть без палитры, без костяно-белых панцирей и без референсных фотографий.
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=160000
export AUDIT_V2=1
run () {
  [ -f "forge/$1.json" ] && { echo "· $1 есть"; return; }
  node tools/forge.mjs "$2" --lane=cli --model=$3 --style=machine --slug=$1 --repairs=2 2>&1 \
    | grep -E "^  (cost|tokens|style|model)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run m-opu-oct   "an armoured octopus"      anthropic/claude-opus-5 &
run m-opu-shark "a shark with sharp teeth" anthropic/claude-opus-5 &
wait
echo WAVE5 DONE
