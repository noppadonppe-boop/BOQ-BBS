# BOQ pricing — v0.47

Complete estimates also require reinforcement input coverage. Missing BBS or unresolved source comparison leaves complete totals pending while known priced subtotals remain available. For explicit unreinforced scope, enter and save its basis on the member. See [coverage guide](BOQ_REINFORCEMENT_COVERAGE.md).

The pricing form offers **ราคาต่อหน่วยรวม** (immutable version1) or **แยกค่าวัสดุและค่าแรง** (version2). Each material/labor part has its own rate, source and note for the same physical unit. Both parts must be entered to complete an item, including an explicit0 with a source when a part is free/not charged. Missing parts remain pending. Changing form modes preserves the unsaved entries for each mode until reload/close; it never allocates a combined quote into guessed components. Saved version1 and old Frozen snapshots retain their calculation policy and original file bytes.

Version2 is `boq-pricing-2.0`: round billing quantity per item/occurrence once, multiply each entered component rate, round each component amount separately, then sum those rounded amounts. This is a different captured commercial policy. For quantity1 and money precision2, material0.005 plus labor0.005 produces0.02; version1 combined rate0.010 produces0.01. Physical quantities, BBS/BS lengths and numerical engineering policies are unchanged. Do not sum repeated component billing quantities as physical takeoff.

Reports retain combined quotes in **ราคารวมเดิม**, alongside explicitly entered material/labor subtotals. Those subtotals only cover entered parts and do not prove a whole-project breakdown when other items remain unpriced or combined. Currencies stay separate and the complete selected estimate remains pending if any selected component/basis is missing. Grouping/scope uses the same rounded component lines. Excel adds component/policy columns and **Cost Components**; BOQ PDF includes component subtotals, detail and separate sources. These remain captured values, not new editable Excel price formulas.

Version2 supports at most610 unique item/component entries per member, with the existing700KB member guard and100,000 commercial-line/15 minor-digit money limits. All clients reading version2 prices need v0.45 or a later compatible version; reload older tabs before adoption. No new database collection or Rules changes. Current writes/security tests use the unchanged local Rules content; they do not certify a separately deployed production schema policy.

v0.45 evidence:697 unit tests (including21 new component cases and36 prior price cases) and28 actual local SDK/dev/compiled/access/export/restore paths pass. Two real app XLSX files and two real A3 PDFs match completed jobs/Storage bytes. All10 final PDF pages and8 readonly commercial Excel views are checked. Restored-project Storage reproduces Frozen v1/v2 quotes and1215.44 synthetic total; working prices give1715.44. These are synthetic quotes, not market recommendations or real project acceptance. See [v0.45 report](../output/component-pricing-verification/DEVELOPMENT_REPORT.html).

Open a saved member and choose **กรอกราคา BOQ**, or open BOQ Summary → **ประมาณราคา BOQ** and choose a member. Admin/QS may save rates; other assigned roles can read the report. Save geometry first. Explicitly reload the pricing form if the member/project version changes while it is open.

Enter currency, billing-quantity decimals, amount decimals, rate sources and commercial conditions. The form initially offers THB / 3 quantity decimals / 2 money decimals as visible editable settings; it does not supply rates. Blank rate means pending. Explicit zero is accepted only with a rate source. Pending quote sources/notes may be saved without a rate. Empty or invalid precision fields prevent saving. Rates are decimal strings, nonnegative, at most12 integer places and6 fractional places, and at most15 significant digits.

Available items come from positive existing physical quantities: concrete, formwork, Foundation earthwork/backfill/lean, and reinforcement grouped by diameter **and grade** using BBS weight. Adjacent context concrete is not an additional takeoff. Counts are occurrence quantities; no extra multiplier comes from drawing callouts. Version1 retains a combined unit rate; version2 records material/labor separately. Automatic VAT/OH/profit, equipment/other component kinds and currency conversion are not implemented.

## Captured version1 calculation policy

`pricing.version=1` corresponds to `boq-pricing-1.0`. Starting from the canonical decimal representation of the existing quantity engine's number, for each item and occurrence:

1. Multiply quantity per element by the occurrence's explicit quantity once.
2. Round that billing quantity half-up to the recorded quantity precision.
3. Multiply the rounded quantity and entered decimal rate using integer decimal arithmetic.
4. Round the line amount half-up to the recorded money precision, then sum these rounded amounts.

Member/Category/Zone/Floor/Summary regroup the same lines; changing a group does not recompute the amounts. A selected scope contains only selected occurrences. The physical quantity engine, BS lengths/density and its unrounded takeoff values are unchanged. Currency totals are separate. If any selected item has a missing rate/basis, the complete selected total stays pending; the subtotal for entered rates is explicitly partial. A complete member group can still have its own total when another group is unpriced. With no commercial basis, the billed-quantity column is pending/blank; original physical quantities remain available in the quantity report.

Prices are stored on the member, with the existing project/member version transaction and operation retry guards. Saving a quote returns the member to Draft and increments both versions; dimensions, bar geometry and technical confirmations remain. Frozen revisions capture member pricing inputs and quantities. Reopening/exporting a Frozen revision uses its captured rates, never the working member's quote. Future pricing-policy changes must use a new version rather than redefining version1. Member copying intentionally clears commercial pricing, including copies within one project; quotations must be reviewed for the new context. Backup/Restore retains working quotes and the original historical snapshot files.

Pricing/copy dialog snapshots are bound to the account that opened them. A different authenticated UID cannot render the old dialog; state clears when the UID changes. The original v0.43 cross-tab timeout was reproduced and fixed through consistent startup/login persistence in v0.44; repeated public UI switches and legacy-session migration are checked within the scope of [that report](../output/auth-persistence-verification/DEVELOPMENT_REPORT.html). Version2 does not change Auth service/context or the parent account guards. Other browsers, live OAuth/offline and production remain unaccepted.

## Excel / PDF

Existing Excel and BOQ PDF exports append commercial pages/tabs when at least one selected member has saved pricing. Unpriced members in that scope remain visibly pending. An old revision with no pricing receives no live price data.

- Excel adds **BOQ Prices**, **Price Summary** and **Price Basis**. Quantity/rate cells preserve exact decimal text; money cells contain captured numeric results. These commercial tabs are snapshot values, not editable pricing formulas. Existing physical BOQ/BBS formulas remain unchanged. Change a rate in the app and capture another version to produce a new estimate.
- A3 BOQ PDF includes quantity, commercial summary, line detail and recorded conditions. It remains a Draft/Frozen reference with NOT FOR CONSTRUCTION; it does not certify engineering or owner acceptance.
- At most100,000 commercial lines and15 digits in money minor units are supported. PDF stops at500 pages. Split an oversized export scope. These bounds are not proof of full-project load capacity or production acceptance.

## Historical v0.43 verification scope

676 unit tests, including36 pricing tests, and30 actual local SDK/dev/compiled/permission/export/restore paths pass. Two genuine app XLSX files and two genuine A3 PDFs match completed job metadata and Storage bytes. All8 PDF pages are rendered;6 price-tab views are checked through readonly ArtifactTool import/recalculation/render. The restored project's own Storage file reproduces the original Frozen quote, checksum and813.73 synthetic total. Current synthetic rates produce1918.73 as a partial subtotal while an unpriced copy keeps the complete total pending.

The isolated QA backend uses byte-identical copies of operative Rules and the previously documented test-only Storage stdout framing adapter. Original services, operative Rules, .env and Auth files remain unchanged. There is no Rules/Hosting deployment. Price validation/arithmetic is application code; the role/transaction tests do not assert that the user's production Rules independently validate the full commercial schema. Native Excel printing, real quotation/quantity acceptance, engineering cases, owner BBS acceptance, Issued and production remain pending. Synthetic rates are not market recommendations.

Readonly Excel rendering may trim trailing zeros from numeric-looking text (for example2.000 appears as2). The original XLSX quantity/rate cells remain exact shared-string text. Price title heights now use the merged span and blank body cells receive continuous row shading. These renderer views are evidence of layout/readability, not a native Excel print acceptance.

See [evidence report](../output/priced-boq-verification/DEVELOPMENT_REPORT.html) and [original requirement status](CURRENT_REQUIREMENTS_STATUS.md).
