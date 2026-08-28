#!/bin/zsh
export OPENROUTER_API_KEY='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'
node tools/orbrain.mjs --model=z-ai/glm-5.3        --fighter=gorilla --think=8000 --timeout=420
for M in moonshotai/kimi-k3 qwen/qwen3.8-max; do
  for F in octopus gorilla; do
    node tools/orbrain.mjs --model=$M --fighter=$F --think=8000 --timeout=420
  done
done
echo THINK DONE
