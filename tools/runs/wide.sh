#!/bin/zsh
# Широкий параллельный фронт: главный вопрос — поднимает ли ПОЧИНЕННЫЙ аудит
# качество тела. Всё зрячим протоколом, разница только в AUDIT_V2.
export CLAUDE_CODE_MAX_OUTPUT_TOKENS=160000
run () {  # $1=slug $2=prompt $3=model $4=audit
  [ -f "forge/$1.json" ] && { echo "· $1 есть"; return; }
  AUDIT_V2=$4 node tools/forge.mjs "$2" --lane=cli --model=$3 --slug=$1 --repairs=2 2>&1 \
    | grep -E "^  (cost|tokens)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
P1="a shark with sharp teeth"; P2="a heavy gorilla"; P3="an armoured octopus"
run v2-son-1 "$P1" anthropic/claude-sonnet-5 1 &
run v2-son-2 "$P2" anthropic/claude-sonnet-5 1 &
run v2-son-3 "$P3" anthropic/claude-sonnet-5 1 &
run v2-hai-1 "$P1" anthropic/claude-haiku-4.5 1 &
run v2-hai-2 "$P3" anthropic/claude-haiku-4.5 1 &
run v2-opu-1 "$P1" anthropic/claude-opus-5 1 &
run v2-opu-2 "$P3" anthropic/claude-opus-5 1 &
wait
echo WIDE DONE
