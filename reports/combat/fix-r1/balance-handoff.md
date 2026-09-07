# Balance — round-1 fix handoff (07.09, lead)

The balance lane ran as a sequence of instrument passes driven by the lead
after the agent doing it was cut by the usage limit twice. The evidence is
written up in `docs/COMBAT.md` §4 (weights, headline, what moved) and §7.1
(passes, duels, bodies, pace, gates); this file is the index.

| step | file | result |
|---|---|---|
| v6 pass, first without the cost feature, at the v5 prices | `reports/combat/atombalance-panel-v6.md` | NOT CONVERGED, spread 1.46, traps root/knock/weaken/boost/lob |
| magnitudes for the traps (D200) | `src/skills/registry.js` | root 2.2 s, knock 8, weaken ×0.5, boost ×1.6 × 4.0 s, mortar 18 m/s + 2.2 m splash, lunge wind-up 0.30 s, field radius 2.6 m, beam wind-up 0.5 s |
| v7 pass | `atombalance-panel-v7.md` | spread 1.30, traps boost/beam; proposal applied at damping ½ |
| v8 pass | `atombalance-panel-v8.md` | spread 1.21; applied at damping ½ (deliveries mean-preserving, 0.3) |
| budgets | registry `SKILL_BUDGET 28`, `KIT_BUDGET 60` | nine stored damage+burn abilities at 23–27 and one kit at 59 stay legal (`checkkits` 78/78) |
| v9 pass, 480 kits (final evidence) | `atombalance-panel-v9.md` | spread **1.11**, two negatives at the floor (knock, weaken → cost 1) |
| bodies | `tools/sizebalance.mjs --rounds=20` | worst 10.3 pp (gate 12) after the hp shift |
| hp axis +60 (D201) | `src/core/config.js` BUILD_AXES.hp 210…360, default 240 | ladder six median 12.7 → 16.5 s; minds cross 18.6 → 20.6 s |
| duels | `reports/combat/duels-v9.md` | see §7.1 |
| gates | `checkprices` (ratchet ≤ 1.2, no trap above the floor), `checkgrammar` (re-counted), `checkspec` (1–10), `checkdocs` | green |

Open (for the next round): knock and weaken read negative at the floor — a
magnitude question; damage is pinned at the price ceiling of 10 (+2.0 pp a
point); the pilot panel is a stall world (68 % burn clock) so its prices are
relative worth; the sustain mirror (two heal+shield kits) can only end on the
arena clock; the gauntlet five is being re-picked on these prices
(`reports/combat/gauntlet/pick-v9.log`).
