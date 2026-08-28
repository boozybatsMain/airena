#!/bin/zsh
export OPENROUTER_API_KEY='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'
for M in moonshotai/kimi-k3 z-ai/glm-5.3 deepseek/deepseek-v4-pro x-ai/grok-4.6 openai/gpt-5.6-sol qwen/qwen3.8-max; do
  for F in octopus gorilla; do
    node tools/orbrain.mjs --model=$M --fighter=$F 2>&1 | tail -1
  done
done
echo FRONTIER DONE
