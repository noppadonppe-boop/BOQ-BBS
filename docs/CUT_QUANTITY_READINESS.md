# Cut-plan quantity readiness — v0.98

Plans now capture the member quantity-input status alongside the selected member version and steel basis. An explicit provisional or malformed quantity basis can still produce a proposal, but the application refuses stock reservation even when steel coverage is complete. The warning names the affected members. Confirm the quantity source in the member editor, save, and generate a new plan before reserving stock. The earlier proposal becomes stale; saving a review does not silently update its captured basis.

Input-reviewed quantities are separate from engineering and fabrication approval. A working-plan reservation does not authorize cutting. Contradictory Issued data containing provisional member quantities is rejected; a successful real Issued/Consumed workflow is still unverified.

The optimizer and numerical adapters are unchanged. Legacy members without a quantityBasis field retain their previous captured structure and behavior; they are not retrospectively certified. Explicit null/false/zero/string/malformed bases are provisional. Older plans that captured explicit quantity-basis members without this status require regeneration. Scoped quantities remain selected once, with the original full member quantity recorded separately.

Cut-plan Excel adds the captured quantity status to column G of Cut Basis. Raw quantities, pattern formulas, kerf and minimum reusable offcut cells retain their existing meaning. The two QA exports are direct plan exports, not registered export jobs: the provisional plan is Proposal; the input-reviewed plan is Cancelled after reservation/cancellation QA. Both are NOT FOR CONSTRUCTION.

Validation: 1662 unit cases in 119 files; TypeScript and compiled build pass. A signed local SDK fixture uses three members, two 800 mm pieces each, one 3000 mm stock rod and two existing 2000 mm offcuts. It balances 7000 = 4800 cut + 18 kerf + 394 scrap + 1788 reusable offcut. Provisional reservation leaves stock and ledger unchanged. After quantity input review, the old proposal is stale; the new proposal retains exact demand/patterns and actual reservation/cancellation succeeds. Dev and compiled desktop/mobile warnings pass. Read-only spreadsheet recalculation and rendered layout checks pass without changing exported bytes.

These are application/direct-SDK command checks. Owner-managed Rules have not been edited or deployed and do not establish this quantity invariant for authorized raw database writes. Raw/server enforcement, Production, engineer approval, physical special-shape closure, and the full original twelve requirements remain pending. No production requests or Cloud Functions were used.

[Evidence and downloads](../output/cut-quantity-readiness-verification/DEVELOPMENT_REPORT.html)
