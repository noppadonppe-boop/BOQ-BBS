# Element templates (T1, v0.115.0)

Save a finished member as a template, make new members from it. Three levels:

| Level | Stored at | Read | Write |
|---|---|---|---|
| Project template | `projects/{pid}/elementTemplates/{id}` (`scope: 'project'`) | project members | admin / QS of the project (+ MasterAdmin) |
| Project default | `projects/{pid}.templateDefaults[key] = templateId` | project members | admin / QS |
| Central template | `my-boq-app/root/elementTemplates/{id}` (`scope: 'workspace'`) | approved users | MasterAdmin |
| Proposal | `my-boq-app/root/elementTemplateProposals/{id}` | proposer, MasterAdmin | created by admin / QS of the source project; decided once by MasterAdmin |

Previous versions: `<template>/versions/{n}` (append-only). Rules and deploy order: `docs/SECURITY_RULES.md` (T1 section).

## Code

- Domain `src/domain/elementTemplates.ts`: schemas (`templatePayloadSchema` + optional `include`, `sheetLayout`, `drawingEdits`,
  `sourceSpec`; `elementTemplateSchema` + `tags`, `key`, `origin`; `templateVersionSchema`; `proposalSchema`), paths,
  `templatePayload(m, {include, spec})`, `memberFromTemplate(t, code, project, {level, occurrence})` (always an independent
  member; input bars regenerated with the target spec, own bars copied; `include.generated = false` drops the generated bars;
  sets `member.templateSource`; bar ids are kept so `sk-<part>-…` / `pp-<part>-…` keep their owner / preset; shape-model members
  run `applyPartPresets` like the shape editor's apply: presets rebuilt with the target spec, `genref-*` / `genext-*` placement
  regions rebuilt — the payload does not carry the placement context), `templateKey()` (category or `Foundation:spread|pile`, `Beam:single|group`,
  `Column:single|stack`, `Slab:single|floor`), `categoryDefaults()` / `withDefault()`, `specDifferences()`, `templateFacts()`,
  `newerVersion()`, `nextTemplate()` (version + 1, previous version record), `templateMigrationPlan()`, backup helpers
  `backupTemplates()` / `restoredTemplate()` / `restoredDefaults()`.
- `member.templateSource` (`src/domain/templateSource.ts`): `{scope project|central, templateId, version, name, projectCode?}` —
  shown as “สร้างจาก Template … vN” (+ “มีเวอร์ชันใหม่ vN”), locks nothing, excluded from the drawing status hash, kept by
  member copy.
- Data `src/data/elementTemplates.ts`: `useTemplateLibrary(project, category)` (project templates + old central documents with
  `scope: 'project'` of this project until migrated, marked `legacy`; central templates), `saveTemplate` (project:
  `projectTransaction` admin / QS, optional `setDefault`; central: MasterAdmin), `deleteTemplate` (clears defaults that point at
  it), `setTemplateDefault`, `proposeTemplate`, `useProposals`, `decideProposal` (approve = new central template or a new version
  of `targetCentralId`; reject needs a reason), `templateVersions`, `migrateLegacyTemplates({dryRun})`.
- UI `src/components/ElementTemplates.tsx`: `SaveTemplateButton` / dialog (artboard 11: name, description, category read-only,
  project | central (+ default checkbox; non-MasterAdmin = proposal, optionally as a new version of a central template),
  include options, preview, same-name = new version, own proposals with status / reason), `CreateMemberDialog` (artboard 12:
  blank | project | central tabs, search, default badge, preview, new code with duplicate check, quantity / zone / floor, spec
  warning, “ผูกกับ Template” shown disabled for the next round, ★ default toggle), `TemplateSourceNote` (member header),
  `CentralTemplateAdmin` (Admin page: proposals + migration).
- Backup: `bundle.elementTemplates` (project templates only, backup snapshots); restore writes them into the target (ids kept,
  `projectId` / `projectCode` re-pointed; versions not carried) and `templateDefaults` in the project patch
  (`restoredTemplateEntries` / `restoredTemplateDefaults`); `elementTemplates` joins the “target must be empty” collections.
- Migration: in-app (MasterAdmin) or `tools/security/migrateElementTemplates.mjs` (Admin SDK).

## Tests

- `tests/elementTemplates.test.ts`: data layer against an in-memory Firestore stand-in (save / create / edit / save, ACI → BS,
  defaults, versions, proposals, migration, backup / restore, include options).
- `npm run test:rules`: 8 T1 cases (`tests/rules/securityRules.emu.ts`).

## Not in this round

- “ผูกกับ Template” (linked members updated from a new template version) — shown disabled.
- Previous versions are listed by `templateVersions()` but there is no UI to restore one.
