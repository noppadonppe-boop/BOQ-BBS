# BOQ reinforcement input coverage — v0.47

An empty BBS is **unknown**, rather than an accepted zero quantity. The member workspace, overview, BOQ scopes, price form, Excel and BOQ PDF now expose this distinction. Known takeoff and price subtotals remain available, with the complete selected estimate pending until its reinforcement inputs and prices are entered.

| Input | Display | Complete reinforcement input |
|---|---|---|
| No app bars and no explicit no-rebar scope | รอ BBS | Pending |
| Entered bars with unmatched, missing, different or extra source rows/file problems | รอเทียบแบบ / บางส่วน | Pending |
| Entered bars without a transcribed source table, or a numerically matching source table | BBS ที่กรอก | Entered input only |
| No bars/source table and a saved explicit no-rebar basis | ไม่มีเหล็กตามขอบเขตที่ระบุ | Numeric zero for that manual scope |

For a scope with no reinforcement, open the member's **ขอบเขตเหล็กเสริม**, choose **ระบุขอบเขตที่ไม่มีเหล็กเสริม**, enter the reason and reference, apply, then save the member. A blank reason cannot be applied. Bars or a source table conflict with this declaration and are rejected. This is a user's scope statement, never engineering/owner approval.

Changing physical/context definitions, member code/category, occurrence locations/counts or a source table clears a reused declaration. Copying a member clears it. A new drawing, calibration/annotation change or specification change resets it through the existing source/spec workflow; a rolled-back change restores the captured before-state. Prices alone do not change the physical scope. Identical Frozen and restored inputs preserve the saved basis as data, with the existing Draft/engineering/release gates.

Source diameter/grade/mark/count/cut length and current attachment SHA/page mapping must reconcile. If transcribed source weights or a printed total differ, coverage stays pending; no standard acceptance or printed-rounding tolerance is invented. The `1e-6` comparison precision only handles floating-point arithmetic, not engineering acceptance. Matching numbers and source pictures do not establish matching bending shapes or installed positions.

Member/Category/Zone/Floor/Summary totals use the selected occurrences once. Pending counts count distinct selected members, not quantities or callouts. A selected plain scope may be entered while another excluded scope remains pending. Entered subtotals can include positive BBS weight that still needs source reconciliation.

Excel preserves existing raw quantity formulas and adds steel input status/complete-rebar columns, **BOQ Coverage** with reasons/bases, and commercial completion status. Pending complete quantity/price cells are blank; declared no-rebar quantities are numeric0. **Known subtotal** and **Entered price total (quantities may be partial)** retain the old captured arithmetic. They are not complete tender totals. BOQ PDF shows pending/entered values, the member coverage page and pending commercial totals.

The quantity/BS numerical policy and commercial policies1/2 remain unchanged. `pricingReport.total` retains the sum of entered priced items for compatibility; `completeTotal` adds the reinforcement input prerequisite. User-facing completion views use `completeTotal`. Old Frozen/source files are immutable; regenerating an older snapshot derives coverage from its captured inputs rather than filling missing data from live records.

Local verification:750 unit cases across50 files; actual isolated SDK/assigned-role/CAS/retry/Frozen/Backup/Restore paths and dev/built public UI; genuine app XLSX/PDF files tied to completed jobs and Storage SHA. Native Excel printing and production Rules/Hosting have not been accepted. Reload older tabs to v0.47 before interpreting complete BOQ/price status: v0.46's false complete claim on unentered BBS was reproduced directly.

See [development evidence](../output/reinforcement-coverage-verification/DEVELOPMENT_REPORT.html) and [the original12 requirements](CURRENT_REQUIREMENTS_STATUS.md). User-owned Rules/config/Auth were not changed or deployed. Real GULF source rows remain unconstructed app reinforcement; engineering/ACI/owner Issued acceptance remains outstanding.
