# Combat Mode: Arena

Fantasy-medieval arena autobattler for iPhone (landscape). Fight in real time as one captain or let your whole team autobattle, run a mercenary club across seasons, and climb leagues and cups.

Design inspiration: the structure of Eslabong (arena combat + club management). All names, classes, art and text here are original.

## Stack

TypeScript, Vite, Phaser 4 for rendering and input, Vitest. iOS release later through Capacitor.

## Architecture (three layers, kept apart on purpose)

| Layer | Folder | Rule |
| --- | --- | --- |
| Battle simulation | `src/sim` | Pure TypeScript. No DOM, no Phaser, no `Math.random()`. Fixed time step, seeded `Rng`. Same seed + same input = same fight. |
| Game logic | `src/data`, `src/club` | Classes and abilities are data. Roster, market, seasons, economy, saves (with `SAVE_SCHEMA_VERSION`). |
| Presentation | `src/scenes`, `src/ui` | Phaser scenes. Reads state from the layers above, never owns game rules. |

## Commands

```
npm install
npm run dev        # local dev server
npm run typecheck
npm test
npm run build      # typecheck + production build into dist/
```

## Working rules

- `npm run typecheck`, `npm test` and `npm run build` must all pass before every push (CI enforces it).
- Versioning: bugfix = minor bump (1.0 -> 1.1), new feature = major bump (1.x -> 2.0). Version lives in `src/version.ts`; `package.json` must match (test enforces it).
- Anything that touches player-supplied text must be escaped before it reaches HTML.
- When something that used to work breaks, check the earlier working version before patching from scratch.
- Roadmap and milestones: see `docs/ROADMAP.md`.
