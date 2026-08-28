# reports/

Measured output. Regenerate any of it with the tool named beside it.

| | |
|---|---|
| `tournament.json`, `tournament.txt` | `tools/tournament.mjs` — every octopus against every gorilla |
| `falsify.json`, `falsify.txt` | `tools/falsify.mjs` — program diversity, the reactivity ablation, the permutation test |
| `balance-search.json` | `tools/balance.mjs` — the top 20 constant candidates from the last search |
| `screens/` | full-frame captures of matches, HUD included. Regenerate from the viewer with `?shots=1&n=12` |
| `brains-g/` | the population the shipping constants were **fitted** to. `brains/` holds the **held-out** one |
| `archive/` | earlier populations and their measurements, from before the final rules. `tools/checkstale.mjs` says which constants have moved under each |
