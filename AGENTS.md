# AGENTS.md

## Commands
- Dev server: `npm run dev` (Vite, http://127.0.0.1:5173)
- Local Firebase: `npm run emulators`
- Verify (typecheck + build): `npm run build`
- No test suite is committed; `vitest` is installed for ad-hoc tests (`npx vitest run <file>`).

## Structure notes
- Element input (manual / from drawing) → `src/domain/elementInput.ts`; UI `src/components/ElementInputPanel.tsx`.
  It converts the per-category input into the existing member fields and generated bars (ids prefixed `gen-`).
- A3 BBS sheet (views + BBS table + BOQ table + title block), layout id `sheet-a3-v10`:
  layout in `src/domain/bbsSheet.ts` → renderer-agnostic primitives (`src/domain/drawingPrims.ts`),
  drawn as SVG by `src/components/PrimsSvg.tsx` (preview in the "แบบ & BBS" tab) and as PDF by `src/data/primsPdf.ts`.
  Plan/section geometry: `src/domain/elementViews.ts` (also used by `ElementGraphic`).
- Do not edit or deploy `firestore.rules`, `storage.rules`, `.env` or Firebase config; the owner manages them.
