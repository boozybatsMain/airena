#!/bin/zsh
# Фронтиры. У этих трёх на мозгах размышление съедало весь лимит ответа
# (GLM выбрал 63 981 из 64 000 и вернул ноль символов), и лечилось это только
# явным бюджетом раздумий. Тело вчетверо больше мозга, поэтому потолок ответа
# поднят, а раздумья ограничены — иначе до кода дело снова не дойдёт.
export OPENROUTER_API_KEY="$OPENROUTER_API_KEY"
run () {
  node tools/forge.mjs "an armoured octopus" --model=$2 --style=machine \
    --slug=$1 --repairs=2 --hardonly --think=8000 --maxtok=100000 2>&1 \
    | grep -E "^  (cost|tokens)|done in|KEPT|forge failed" | sed "s|^|  [$1] |"
}
run rp-glm z-ai/glm-5.3          &
run rp-kim moonshotai/kimi-k3    &
run rp-qwn qwen/qwen3.8-max      &
wait
echo REPRICE2 DONE
