#!/bin/zsh
# Вторая волна: аудит с ВСЕМИ правками, включая greebles-not-facing-camera.
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=160000
export AUDIT_V2=1
run () {
  [ -f "forge/$1.json" ] && { echo "· $1 есть"; return; }
  node tools/forge.mjs "$2" --lane=cli --model=$3 --slug=$1 --repairs=2 2>&1 \
    | grep -E "^  (cost|tokens|style)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run v3-son-shark "a shark with sharp teeth" anthropic/claude-sonnet-5 &
run v3-son-gor   "a heavy gorilla"          anthropic/claude-sonnet-5 &
run v3-son-oct   "an armoured octopus"      anthropic/claude-sonnet-5 &
run v3-opu-shark "a shark with sharp teeth" anthropic/claude-opus-5 &
run v3-hai-shark "a shark with sharp teeth" anthropic/claude-haiku-4.5 &
wait
echo WAVE2 DONE
