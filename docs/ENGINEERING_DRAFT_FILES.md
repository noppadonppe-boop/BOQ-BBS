# Engineering preparation files — v0.57

v0.58 adds [read-only comparison after opening a preparation file](ENGINEERING_PREVIEW.md), including actual source-byte verification and a separate diagnostic JSON download. Preparation file format/version and its editing/persistence/approval boundaries below remain unchanged. Original v0.57 verification remains historical evidence.

Use **กรณีตรวจคำนวณ** in an assigned project to retain partially entered reference values as a JSON file. This works while database case persistence is disabled. It does not calculate a comparison, create a stored case/run, approve BS/ACI, change quantities or unlock Issued. The user owns Rules and deployment; no Rules, Auth configuration, `.env` or backend was changed for this feature.

## Prepare and retain work

1. An admin/QS opens **เพิ่มกรณีตรวจ** and selects a saved member. Enter the reference document/page, author/scope, BOQ totals, per-Mark cut length/count/mass and comparison bounds as available.
2. Select **บันทึกไฟล์เตรียมตรวจ**. Incomplete fields may remain blank. A blank expected value remains blank; explicitly entered `0` remains `0`. Expectations are never populated from the engine under test. Negative/nonfinite entries are refused with a readable message without closing the form.
3. Keep the JSON with the engineering handoff package. It contains the captured member input/version, numerical Spec/engine, optional source metadata/SHA256, raw entered fields and a content checksum. It includes no source PDF/image bytes, project ACL, Storage path or calculation results. `engineeringApproved` and `sourceBytesIncluded` are always false. It does not transfer access or approval authority.

The file is bounded to1,000,000 UTF-8 bytes. Blank source selection is allowed for preparation; a selected source needs verified metadata and a valid page. The supplied BS8666:2000+Amd1/2 minimum and geometry-2.2+bs8666-2000-v7 numerical policy are unchanged. Expected error text may retain multiple lines, up to16,000 characters.

## Open and continue

Use **เปิดไฟล์เตรียมตรวจ** either on the page or inside a preparation form. JSON is shown in a read-only preview first; opening never replaces the current form or a saved member. Windows UTF-8 BOM and formatting-only changes are accepted. Malformed, oversized, checksum-altered, unsupported or forged-approval structures are rejected. The checksum proves content consistency, not the author, independent correctness or engineering approval.

Select **กรอกต่อจากไฟล์** explicitly to restore fields to an editable preparation form. This is available only to admin/QS, and only when the current project, complete saved member input, numerical Spec and selected source metadata/status match the capture. Even a changed input with the same member version is blocked. A stale/foreign file remains readable as a handoff record but cannot overwrite the current form or member. Reference bytes are not reread by this JSON reader; inspect and retain the original document separately.

If a member changes while a form is open, the captured preparation remains available for file download. Loading current input explicitly clears expectations/source selection. A file made from old input cannot continue against changed input. On account switch, the old preview closes. If an editor loses their project role, an open editing form closes and only read-only file viewing remains. Unsaved in-memory fields are lost on closure; download work while still authorized.

Viewer users may open an external preparation file for review, but cannot start a case, continue editing or use the in-form save action. Opening an externally supplied file does not grant access to its project or referenced Storage object. Handle captured project/member data with the same care as other handoff documents.

## Database and acceptance boundary

Portable preparation files are separate from stored case/run JSON and whole-project Backup/Restore. They are not automatically added to project history or restored as approved cases. `VITE_ENABLE_ENGINEERING_FIXTURES` remains false in this verification environment; new collection queries, case writes and runs remain closed. The unchanged local Rules actually deny new case collection reads. See [the stored-case contract](ENGINEERING_FIXTURES.md) before the database owner chooses to enable that workflow.

This iteration passed916 unit cases across58 files and19 actual local SDK/compiled-UI scenarios, with four actual browser downloads and desktop/mobile review. The test project uses real GULF concrete dimensions/reference PDF and **two synthetic straight bars**, not the original drawing's reinforcement. Partial values and synthetic diagnostic text in the sample files are not independently accepted numerical cases. There is no new BBS PDF/XLSX, Backup/Restore, native printing or production test this iteration. See [the scoped evidence report](../output/engineering-draft-verification/DEVELOPMENT_REPORT.html).

Independently approved numerical cases, project BS/ACI editions/details, actual GULF reinforcement, Code33 support/Code51 physical closure, owner acceptance, Issued, stock consumption/offcut creation and production acceptance remain pending.
