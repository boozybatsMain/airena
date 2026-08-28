#!/bin/zsh
# Волна 3: всё вместе — зрячий ремонт, починенный аудит, правило про камеру
# И брифинг о камере в самой инструкции стиля.
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=160000
export AUDIT_V2=1
run () {
  [ -f "forge/$1.json" ] && { echo "· $1 есть"; return; }
  node tools/forge.mjs "$2" --lane=cli --model=$3 --slug=$1 --repairs=2 2>&1 \
    | grep -E "^  (cost|tokens|style)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run v4-son-shark "a shark with sharp teeth" anthropic/claude-sonnet-5 &
run v4-son-gor   "a heavy gorilla"          anthropic/claude-sonnet-5 &
run v4-son-oct   "an armoured octopus"      anthropic/claude-sonnet-5 &
run v4-opu-shark "a shark with sharp teeth" anthropic/claude-opus-5 &
run v4-opu-gor   "a heavy gorilla"          anthropic/claude-opus-5 &
run v4-hai-shark "a shark with sharp teeth" anthropic/claude-haiku-4.5 &
wait
echo WAVE3 DONE
