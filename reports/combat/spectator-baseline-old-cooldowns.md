# Spectator baseline — BEFORE the overhaul (cost-derived cooldowns, 7–16 s)

Captured by the lead from the first run of `reports/combat/spectate.mjs` (36 matches, 12 matchups,
seeds 1–3, roster ARRESTER · THE RIFT · STONE GOLEM×2 · ICEBREAKER · STORM) at 23:08 on 06.09,
before `src/skills/registry.js` gained per-delivery cooldowns. The agent's file
`spectator-baseline.md` was re-run after that change and now shows the new-cooldown world with
the OLD magnitudes; these are the numbers of the world players were watching.

| metric | value |
|---|---|
| match length | mean 37.1 s, median 37.2 s, range 31.4–40.7 s |
| time to first hit | 4.7 s mean, 2.3 s median |
| casts per fighter per match | 11.3 mean (3.06 per 10 s) |
| cooldown utilisation | 88% — the cadence was set by the cooldowns, not the minds |
| hit rate (targeted + zone) | 74% (347 hit, 69 miss, 5 evaded, 49 empty zones) |
| fighter has no act running | 84% of its ticks |
| … idle with an ability ready | 24% |
| … waiting with EVERY ability on cooldown | 60% |
| both fighters fully on cooldown at the same tick | 56% |
| both fighters with no act at the same tick | 74% |
| distance > 12 m | 6% · distance < 4 m | 42% · mean 6.3 m |
| dodges | 0 airborne + 5 i-frame (0.14 per match) |
| sudden death | 36 of 36 matches reached the burn; 34 fighters were killed by the arena |
| results | kill 34, double-ko 2 |
| refused orders | silenced 129 |

Reading: a fighter had nothing running for 84% of its time and for 60% of it could do nothing but
walk. Every fight went to the arena's burn and nearly every death was the arena's, not a hit.
