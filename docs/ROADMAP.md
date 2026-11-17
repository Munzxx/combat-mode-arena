# Roadmap

Each milestone ends with a control point: playable build on GitHub Pages, tested by the owner on iPhone before the next one starts.

| Milestone | Scope |
| --- | --- |
| **M0** (v1.0) | Repo, CI, GitHub Pages, landscape scaling, seeded RNG + tests. |
| **M1** | Battle prototype: 6 classes, data-driven abilities, autobattle AI, touch-controlled captain (virtual stick + ability buttons), 1v1 up to 4v4, hit feedback (shake, hit-stop, damage numbers). |
| **M2** | Club loop: roster, gold, market, league fixtures and standings, saves. |
| **M3** | Chests, trainers and staff, shiny versions, codex, cups. |
| **M4** | Content scale-up, balance runs (thousands of headless fights), PvE challenge mode, 8v8. |
| **M5** | Capacitor, TestFlight, Game Center, in-app purchases, App Store submission. |

Async PvP needs a backend (e.g. Cloudflare Workers) and is kept out of the first release.

## Monetization principles

Chests are earned by winning. Sell cosmetics and convenience directly. No paid random chests (Dutch loot box rules, PEGI 16 implications).

## Art

Direction is decided at the M1 control point. Until then placeholder shapes are used; sprites sit behind one loader so art can be swapped without touching game code.
