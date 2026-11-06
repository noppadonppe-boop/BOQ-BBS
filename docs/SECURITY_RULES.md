# Security rules (SEC1) — Firestore / Storage by project role, AI keys out of client reach

Files: `firestore.rules`, `storage.rules` (repository root, **not deployed by the agent**). Tests: `npm run test:rules`
(`tests/rules/securityRules.emu.ts`, separate demo emulators, `@firebase/rules-unit-testing` 5).

## Who is who

Authority is the signed-in user's profile `my-boq-app/root/users/{email}` — the same source every web command checks
(`assignedRoles`, `src/domain/authAccess.ts`):

- **signed in** = Firebase Auth user with an e-mail, not anonymous; **approved** = profile `uid` = auth uid and `status == 'approved'`.
- **MasterAdmin** = approved + `roles` contains `MasterAdmin` → every project, every role.
- **project roles** = `projectRoles[pid]` when present, else the profile `roles`; `Admin` / `SuperAdmin` count as `admin`; nothing
  known → `viewer`; only for projects in `assignedProjects`.
- **global admin** (General Spec, element templates, new projects) = `roles` contains MasterAdmin / Admin / SuperAdmin / admin.

`project.acl` / `roleSets` are kept for display / history; they are not the authority (as in the commands).
The app root name is `my-boq-app` (`VITE_APP_NAME` default). If the deployment uses another name, change `APP()` / the
`/my-boq-app/root` match in `firestore.rules` and the profile path in `storage.rules`.

## Firestore paths × roles

R = read, C = create, U = update, D = delete. “member” = any role in the project (incl. viewer). ✗ = nobody (clients).

| Path | R | C | U | D | Commands (roles checked in the web code) |
|---|---|---|---|---|---|
| `projects/{pid}` | member | global admin, `acl[me]=='admin'`, version 1 | member, keys by role (below) | ✗ (soft delete) | createProject (global admin), every command bumps `version` |
| ↳ project keys | | | `version` (never back), `historyEpoch`, `revisionCounter`, `engineeringFixtureEpoch`, `updatedAt`: member · `spec`: admin / qs / approver · `locations`, `boqChapters`, `sheetTemplates`, `specChangeState`, `stockEpoch`: admin / qs · `acl`, `roleSets`, `aiConsent`, `deleted`, names / title block / logo / disciplines, `restoreState`: admin · anything else ✗ (incl. the old `aiSendLog` array) | | saveProject / setProjectAccess / setAiConsent / deleteProject (admin), saveLocations / BoqChapters / SheetTemplates, spec jobs (admin, qs), approveEngineeringSpec (approver), exports (all roles) |
| `…/operations/{id}` | member | member, `uid == me` | ✗ | ✗ | request receipt of every command (append-only) |
| `…/accessEvents/{id}` | member | admin, `actorUid == me` | ✗ | ✗ | setProjectAccess, updateProfile (append-only) |
| `…/revisionEvents/{id}` | member | member | ✗ | ✗ | snapshot / release / submission (append-only) |
| `…/importedHistory/{id}` | member | admin | ✗ | ✗ | restore (append-only) |
| `…/aiSendLog/{id}` | member | admin / qs / detailer, `uid == me`, `email == mine`, project `aiConsent.enabled` | ✗ | ✗ | logAiSend (append-only) |
| `…/revisions/{id}` | member | member | ✗ | ✗ | freeze (frozen: written once) |
| `…/revisionStates/{id}`, `…/exportJobs/{id}` | member | member | member | ✗ | freeze / export (viewer may export) |
| `…/members/{mid}` | member | admin / qs | admin / qs any key · detailer only `sheetLayout`, `drawingEdits`, `version`, `updatedAt` · checker / approver only `status`, `review`, `drawingSetup`, `version`, `updatedAt` | admin / qs | saveMember, copy, floor beams, renumber (admin, qs) · saveMemberDrawing (admin, qs, detailer) · review / approve (checker, approver) |
| `…/attachments/{id}` | member | admin / qs | admin / qs | ✗ (superseded, never removed) | sources, spec jobs |
| `…/beamMarks/{id}` | member | admin / qs / detailer | same | same | beam marks |
| `…/specChangeJobs/{id}` | member | admin / qs | admin / qs | ✗ | spec / WBS / occurrence / area jobs |
| `…/restoreJobs/{id}` | member | admin | admin | ✗ | restore |
| `…/submissionJobs/{id}` | member | admin / qs / approver | same | ✗ | submissions |
| `…/submissionNumbers/{id}` | member | admin / qs | ✗ | ✗ | submissions |
| `…/stock/{id}`, `…/cutPlans/{id}` | member | admin / qs | admin / qs | ✗ | stock / cutting |
| `…/stockLedger/{id}` | member | admin / qs | ✗ | ✗ | stock ledger (append-only) |
| `…/engineeringFixtures/{id}` | member | admin / qs | admin / qs | ✗ | engineering fixtures |
| `…/engineeringFixtureRuns/{id}`, `…/code99Reviews/{id}` | member | admin / qs / checker / approver | ✗ | ✗ | fixture runs, Code 99 reviews |
| `…/{other}/{id}` | member | admin / qs | admin / qs | ✗ | anything not listed (default) |
| `my-boq-app/root/users/{email}` | own, MasterAdmin | own: pending Staff, no projects — or the very first account (no `appMeta`) as approved MasterAdmin | own: `firstName`, `lastName`, `position`, `department`, `photoURL`, `profileVersion`, `updatedAt` · own new project (`accessChange.kind == 'CreateProject'`, project created in the same write with me as admin) · a project admin: that project's entry only (`accessChange.projectId`) · MasterAdmin: any | ✗ | register, updateProfile, createProject, setProjectAccess |
| `…/directory/{uid}` | approved, own | own (status = own profile status), MasterAdmin | same, + approved: `profileVersion` only | ✗ | names / status for team lists |
| `…/directoryEmails/{email}` | approved, own | own | own | ✗ | find a user by e-mail |
| `…/appMeta/config` | signed in | with one's own new profile, `totalUsers == 1` | +1 with one's own new profile, `firstUid` unchanged | ✗ | registration counter / first user |
| `…/profileOperations/{id}` | own, MasterAdmin | approved, own | ✗ | ✗ | updateProfile / createProject receipts (append-only) |
| `…/activityLogs/{id}` | MasterAdmin | signed in, own uid | ✗ | ✗ | login / register log (append-only) |
| `…/apiProviders/config` | approved | MasterAdmin | MasterAdmin | MasterAdmin | active provider, models, `hasApiKey` (no key) |
| `…/apiProviderSecrets/{provider}` | **✗ (nobody)** | MasterAdmin | MasterAdmin | ✗ | the API keys; read only by the gateway (Admin SDK) |
| `…/apiProviderOperations/{id}` | MasterAdmin | MasterAdmin, own | ✗ | ✗ | receipts |
| `…/specProfiles/{id}` (+ sub) | approved | global admin | global admin | MasterAdmin | General Spec profiles |
| `…/elementTemplates/{id}` | approved | global admin | global admin | global admin | element templates |

Append-only (create only, never update / delete — also not by MasterAdmin): operations, accessEvents, revisionEvents,
importedHistory, aiSendLog, revisions, submissionNumbers, stockLedger, engineeringFixtureRuns, code99Reviews,
profileOperations, activityLogs, apiProviderOperations.

## Storage paths × roles

Read = project member. Objects are written once (`resource == null`); **never overwritten or deleted**.

| Folder `projects/{pid}/…` | Create | Limit |
|---|---|---|
| `files/` (sources, restored copies) | admin / qs | ≤ 200 MB · PDF, PNG, JPEG, DWG, DXF, IFC (`application/x-step`), octet-stream |
| `branding/` (logo) | admin | ≤ 2 MB · PNG / JPEG |
| `exports/` | member (viewer exports too) | ≤ 100 MB |
| `snapshots/` | member | ≤ 50 MB |
| `submissions/` | admin / qs / approver | ≤ 60 MB |
| `archive/` (restore) | admin | ≤ 200 MB |
| `spec-manifests/`, `submission-manifests/` | admin / qs / approver | ≤ 40 MB |
| `restore-manifests/` | admin | ≤ 40 MB |
| anything else | ✗ | |

Storage reads the role from Firestore (`firestore.get`, cross-service rules): on the first deploy the console asks to grant the
Storage service agent read access to Firestore — accept it.

## AI keys

Before SEC1 the provider keys were in `my-boq-app/root/apiProviders/config`, which the web read directly — readable by
anyone under the old rules. Now:
- `apiProviders/config`: active provider, model, thinking, `hasApiKey` — readable by approved users (the AI buttons need the
  active provider), written by MasterAdmin;
- `apiProviderSecrets/{openai|anthropic|google-ai-studio}`: `{apiKey, updatedAt, updatedBy}` — no client can read it
  (MasterAdmin included); MasterAdmin creates / updates it from “จัดการ API” (the key is never shown again, only “มี Key แล้ว”);
- the gateway (`functions/index.js` `providerApiKey`) reads the secret with the Admin SDK; a key still in the config is used only
  when there is no secret yet (transition).

## What the owner does, in this order

1. **Review** `firestore.rules` / `storage.rules` (and run `npm run test:rules` locally: 18 cases, all pass).
2. **Deploy the web app of this branch first** (hosting, as usual): the build now online still writes the AI keys into the
   readable config and the AI log as a project array, which the new rules refuse.
3. **Deploy the rules**: `firebase deploy --only firestore:rules,storage --project my-boq-app` (accept the cross-service
   permission prompt for Storage).
4. **Move the keys** (either):
   - in the app: MasterAdmin › จัดการ API › banner “API Key ยังเก็บในที่ที่เว็บอ่านได้” › **ย้าย API Key ไปที่เก็บลับ**; or
   - with the Admin SDK: `node tools/security/migrateApiKeys.mjs --project my-boq-app` (`--dry-run` first).
5. **Deploy the gateway**: `firebase deploy --only functions:analyseDrawing --project my-boq-app` (reads the secrets).
6. **Rotate every AI key at the provider** (OpenAI / Anthropic / Google) — the old keys may already have been read while the
   config was public — and save the new keys in “จัดการ API”.
7. Check with a non-admin account: the project list shows only assigned projects; a viewer cannot save a member; the API page
   shows “มี Key แล้ว” and the AI buttons still work.

Order matters: the app of this branch works with both the old and the new rules; the gateway of this branch works with the
key in either place; the previous web build does not work with the new rules (step 2 first).

## Rollback

- Rules: Firebase console › Firestore / Storage › Rules › History › the previous version › Publish (or redeploy the previous
  file: `git show <old commit>:firestore.rules > firestore.rules` then deploy). The app does not depend on the new rules.
- Keys: the migration only copies to `apiProviderSecrets` and removes from the config; to roll the gateway back, redeploy the
  previous function **and** save the keys again in “จัดการ API” of the previous app build (rotate them anyway).

## Tests

`npm run test:rules` (18 cases, role × action): no sign-in / anonymous / no profile / pending see nothing; members read,
outsiders not (also `documentId() in` list queries); project keys by role (version only forward, spec admin / QS / approver,
ACL / aiConsent admin, no delete, unknown keys refused); create project (global admin with self as admin, nobody can grant
themself an existing project); members by role (detailer drawing keys only, checker / approver review keys only, viewer
none); sources never deleted; spec-change jobs admin / QS; append-only (update / delete refused also for MasterAdmin); AI log
(sender, roles, only while consent is on); own profile (no own roles / status / projects), project admin (that project only,
QS not), registration (pending Staff; first account only when no `appMeta`), directory; AI config / secrets (nobody reads a
secret, MasterAdmin writes); General Spec / activity log; Storage (members read, files once by admin / QS with type / size,
no overwrite / delete, exports by any role, logo admin ≤ 2 MB image, other paths closed, manifests by role).

UI on separate emulators **running the new rules** (`tmp/secemu/`, project `demo-boq-sec`, Vite 5183, empty workspace):

| Flow | Account | Result |
|---|---|---|
| Register the first account → MasterAdmin | new | ✓ |
| Create project SEC-1 | MasterAdmin | ✓ |
| Register a second account → pending | new | ✓ (pending page) |
| Approve + assign project (จัดการผู้ใช้งาน) | MasterAdmin | ✓ |
| Change project role → qs (ทีมและสิทธิ์โครงการ) | MasterAdmin | ✓ (access event written) |
| AI consent on | MasterAdmin | ✓ |
| จัดการ API: save a key → only in `apiProviderSecrets`, config has `hasApiKey` | MasterAdmin | ✓ |
| Old key planted in the config → banner → “ย้าย API Key ไปที่เก็บลับ” | MasterAdmin | ✓ (config clean, secret `migratedFromConfig`) |
| General Spec: create + save | MasterAdmin | ✓ |
| Open project (documentId-in list) | qs | ✓ |
| Add member | qs | ✓ |
| Attach a DXF (Storage + attachment) | qs | ✓ |
| Import the plan from the DXF + build bars + save | qs | ✓ |
| Export PDF A2 / DXF (in the browser) | qs | ✓ |
| Freeze a revision + export job (Firestore jobs + Storage `snapshots/`, `exports/`) | qs | ✓ (job Complete) |
| Schedule PDF → Slab Templates → spec-change job (REST transactions + manifests) | qs | ✓ |
| Backup ZIP | MasterAdmin | ✓ (694 KB) |
| Restore into an empty project SEC-2 | MasterAdmin | ✓ (“Restore แล้ว”) |
| Beams from the slab floor | qs | ✗ **not reached** — stopped before any write by member validation (default beam bars without a Beam Template fail the cover check on the Y lines); reproduced in Node without Firebase, so not a rules effect; its writes (member create, project version, operation) are the paths covered above |
