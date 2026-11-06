# Deploy v0.121.0 — คู่มือเจ้าของ (ทีละขั้น)

> เตรียมโดย Claude Code เมื่อ 2026-11-06 จาก `main` = `c193c9d` (v0.121.0, = `origin/main`) · **เจ้าของรันเองทุกคำสั่งที่เขียน / deploy**
> ฐานเดิม: `docs/SECURITY_RULES.md` (SEC1 + T1 deploy order) — คู่มือนี้รวมเป็นลำดับเดียวสำหรับ 0.121.0
> คำสั่งทั้งหมดเป็น **PowerShell บน Windows** · ทุกขั้นมี: วัตถุประสงค์ · คำสั่ง · สิ่งที่ต้องเห็น · smoke test · rollback · หยุดถ้า…

## สถานะที่ตรวจแล้ว (preflight โดย Claude Code, read-only ต่อ production)

| รายการ | ผล |
|---|---|
| `git status` (ไฟล์ที่ track) | สะอาด · `main` = `origin/main` = `c193c9d` |
| lockfile | `npm ci --dry-run` ผ่าน (root + `functions/`), `npm ls` ตรง |
| `npm run build` | ผ่าน (tsc + vite + `build:ai` → `functions/lib/model-tools.cjs`, `dist/mcp/model-server.mjs`) |
| `npx vitest run tests` | **244 / 244 ผ่าน** เมื่อไม่นับ `tests/footing.tmp.test.ts` (ไฟล์ untracked ของ session อื่น — 8 fail ทั้งก่อนและหลัง merge, ไม่อยู่ใน repo, ไม่ใช่ส่วนของ release) |
| `npm run test:rules` | **26 / 26 ผ่าน** (demo emulators) |
| `functions/` | `npm ci --dry-run` ผ่าน · `npm run check` (`node --check index.js`) ผ่าน · ไม่มี lint / test script · engines `node 22` = `firebase.json` `runtime nodejs22` = runtime ที่ deploy อยู่ (Firebase รองรับ Node 22) |
| Migration scripts | dry-run / apply / ซ้ำ / rollback บน emulator `demo-boq-migrate` ผ่าน 10 / 10 ข้อ (ดู § ขั้น 3–4) |
| Hosting live | site `cmg-boq-bbs` (target `site-02`) release ล่าสุด **2026-11-06 16:21** — bundle ที่ live มีโค้ด SEC1 / T1 แล้ว (`apiProviderSecrets`, `elementTemplateProposals`, `aiSendLog`, `templateDefaults`) แต่ **ยังไม่มี Wall Run** → live ≈ 0.120.0 (commit `6324ccb` 16:19) |
| Functions live | `analyseDrawing` v2 · https · asia-southeast1 · 1024 MB · nodejs22 |
| Rules live | **อ่านไม่ได้จากเครื่องนี้** (ไม่มี gcloud / ไม่มีสิทธิ์ Rules API แบบ read-only) → เจ้าของ copy จาก Console ในขั้น 0.4 แล้ว diff |

### `firebase.json` / `.firebaserc`

| ส่วน | ค่า |
|---|---|
| project | `my-boq-app` (`.firebaserc` default) |
| hosting | target `site-02` → site `cmg-boq-bbs` · public `dist` · rewrite `/analyse-drawing` → function `analyseDrawing` (asia-southeast1) · `**` → `/index.html` · headers nosniff + referrer policy |
| firestore | rules `firestore.rules` · indexes `firestore.indexes.json` (คู่มือนี้ deploy แค่ `firestore:rules`) |
| storage | rules `storage.rules` |
| functions | source `functions` · runtime `nodejs22` · region `asia-southeast1` (`setGlobalOptions` ใน `functions/index.js`) · `analyseDrawing` timeout 540 s, 1 GiB · ต้องมี `functions/lib/model-tools.cjs` (gitignored — สร้างโดย `npm run build`) |
| APP root | `my-boq-app` (web `VITE_APP_NAME` default, functions `APP_NAME`, rules `APP()` + `/my-boq-app/root`) — ถ้า `.env` ตั้ง `VITE_APP_NAME` เป็นค่าอื่น **หยุด**: rules ต้องแก้ก่อน |

### Rules: repo เทียบกับ live

ไม่สามารถอ่าน rules ที่ live ได้จากเครื่องนี้ ไฟล์ rules ใน repo ก่อน SEC1 (`36bcbb5`) เป็น **เปิดทั้งหมด** (`allow read, write: if true` ทั้ง Firestore และ Storage)
ถ้า Console ยังแสดงแบบนั้น การ deploy ขั้น 2 คือ เปิดทั้งหมด → ตามบทบาท ดังนี้ (รายละเอียด path × role: `docs/SECURITY_RULES.md`):

- ทุก request ต้อง sign-in ด้วยอีเมล (ไม่ใช่ anonymous) · สิทธิ์อ่านจาก profile `my-boq-app/root/users/{email}` (`uid` ตรง + `status == 'approved'`)
- `projects/{pid}` อ่านเฉพาะสมาชิก (assignedProjects / MasterAdmin) · key ของ project เขียนตามบทบาท · ห้ามลบ (soft delete)
- `members` เขียน admin / qs · detailer ได้แค่ `sheetLayout` / `drawingEdits` · checker / approver ได้แค่ review — **Wall Run (0.121) เก็บใน member เดิม (`elementInput.wall.run`, `sheetLayout`, `drawingEdits`) จึงไม่ต้องมี path / key ใหม่**
- append-only: operations, accessEvents, revisionEvents, importedHistory, **aiSendLog**, revisions, submissionNumbers, stockLedger, fixture runs, code99, profileOperations, activityLogs, apiProviderOperations, template `versions`
- **`apiProviderSecrets/{provider}`: `allow read: if false`** (ไม่มี client ใดอ่านได้ รวม MasterAdmin) · เขียนเฉพาะ MasterAdmin · ไม่มี rule อื่นที่ match path นี้ (ไม่มี wildcard ระดับ root)
- T1: `projects/{pid}/elementTemplates` (+ `versions` append-only), `my-boq-app/root/elementTemplates` (MasterAdmin เขียน), `elementTemplateProposals` (สร้างเองแบบ pending, MasterAdmin ตัดสินครั้งเดียว, ห้ามลบ), project key `templateDefaults` (admin / qs)
- Storage: อ่าน = สมาชิกโครงการ · เขียนครั้งเดียวต่อ object (ห้าม overwrite / delete) เฉพาะ `projects/{pid}/files|branding|exports|snapshots|submissions|archive|spec-manifests|submission-manifests|restore-manifests/…` ตามบทบาท + ขนาด / ชนิดไฟล์ · **path อื่นทั้งหมดปิด**

ตรวจความเสี่ยงแล้ว: collection ใหม่ `elementTemplates`, `elementTemplateProposals`, `versions` (ทั้งในโครงการและกลาง), `aiSendLog` มี rule ครบ และมี test ใน `tests/rules/securityRules.emu.ts`
`appMeta/config` มีอยู่ใน production (เจ้าของยืนยันจาก Console แล้ว) — สำคัญ เพราะถ้าไม่มี rule ยอมให้บัญชีแรกที่สมัครเป็น MasterAdmin

---

## ลำดับคำสั่ง (สรุป)

| ขั้น | ทำอะไร | คำสั่งหลัก |
|---|---|---|
| 0 | Preflight + สำรอง rules ที่ live | `git worktree add` · `npm ci` · `npm run build` · tests · copy rules จาก Console |
| 1 | Web (hosting site-02) | `firebase hosting:clone … pre-0121` → `firebase deploy --only hosting:site-02` |
| 2 | Firestore + Storage rules | `firebase deploy --only firestore:rules,storage` |
| 3 | ย้าย API keys → `apiProviderSecrets` | ปุ่มในแอป หรือ `migrateApiKeys.mjs --apply --backup …` |
| 4 | ย้าย Template เดิม (เฉพาะโครงการ) | `migrateElementTemplates.mjs` dry-run → `--apply --backup …` (หรือปุ่มในแอป) |
| 5 | Functions `analyseDrawing` | `firebase deploy --only functions:analyseDrawing` |
| 6 | หมุน API keys ใหม่ ลบ key เก่า | ที่ผู้ให้บริการ + “จัดการ API” |
| 7 | เปิด cover policy `rebar-bend-tolerance-1.0` ในโครงการเดิม | General Spec › “รับวิธีตรวจใหม่” |

ทำต่อเนื่องในรอบเดียวได้ แต่ **ต้องทำ smoke test ของแต่ละขั้นก่อนไปขั้นถัดไป** · ขั้น 1 ต้องมาก่อนขั้น 2 เสมอ

---

## ขั้น 0 — Preflight

**วัตถุประสงค์**: build จากสำเนาสะอาดของ `c193c9d` (checkout หลักมีไฟล์ untracked เช่น `public/_beam.html` ซึ่งจะหลุดเข้า `dist/` ถ้า build ในที่เดิม) และเก็บของที่ live ไว้ย้อนกลับ

```powershell
$repo = "G:\PROJECT CODE\BOQ_BBS"
$wt   = "C:\Users\Administrator\boq-deploy-0121"
$bk   = "C:\Users\Administrator\boq-deploy-backup"   # นอก repo: backup ของ migration (มี API key)
cd $repo
git fetch origin
git status --short --untracked-files=no      # ต้องว่าง
git rev-parse HEAD origin/main                # ต้องเป็น c193c9d… ทั้งสองบรรทัด
git -c core.longpaths=true worktree add --detach $wt c193c9d
Copy-Item "$repo\.env" "$wt\.env"
Copy-Item "$repo\.firebaserc" "$wt\.firebaserc"
New-Item -ItemType Directory -Force $bk | Out-Null
```

```powershell
cd $wt
Select-String -Path .env -Pattern '^VITE_USE_EMULATORS|^VITE_APP_NAME'   # ต้องเป็น VITE_USE_EMULATORS=false · VITE_APP_NAME ไม่มี หรือ = my-boq-app
npm ci
cd functions; npm ci; npm run check; cd ..
npm run build
npx vitest run tests
npm run test:rules        # ต้องมี Java; ถ้า Java ฟ้อง unix domain socket: $env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=C:/jtmp"
Get-ChildItem dist -Filter "_*.html"           # ต้องว่าง (ไม่มีไฟล์ทดสอบหลุด)
Test-Path functions\lib\model-tools.cjs        # True
```

```powershell
firebase login:list
firebase use my-boq-app
firebase hosting:channel:list --site cmg-boq-bbs --project my-boq-app
firebase functions:list --project my-boq-app
```

**0.4 สำรอง rules ที่ live** — Firebase Console › Firestore Database › Rules: copy ข้อความทั้งหมดไปเป็น
`docs\deploy-backup\firestore.rules.live-20261106` · Storage › Rules: → `docs\deploy-backup\storage.rules.live-20261106` (ใน `$repo`) แล้ว diff:

```powershell
cd $repo
git diff --no-index docs\deploy-backup\firestore.rules.live-20261106 firestore.rules
git diff --no-index docs\deploy-backup\storage.rules.live-20261106 storage.rules
```

**สิ่งที่ต้องเห็น**: build / tests / rules tests ผ่าน (`Tests 244 passed`, `Tests 26 passed`) · `dist\index.html` มี · diff rules = เปิดทั้งหมด → ตามบทบาท (ดูหัวข้อด้านบน) หรือ = rules SEC1 / T1 ที่เคย deploy (diff ว่างหรือเล็ก)

**Smoke test**: — (ยังไม่เปลี่ยนอะไร)

**Rollback**: ลบ worktree: `cd $repo; git worktree remove --force $wt` (ถ้าลบโฟลเดอร์ไม่หมดเพราะ path ยาว: `cmd /c rd /s /q "\\?\C:\Users\Administrator\boq-deploy-0121"`)

**หยุดถ้า…** HEAD ≠ `c193c9d` / origin ไม่ตรง · test ใด fail (ยกเว้นไม่มีไฟล์ `tests/footing.tmp.test.ts` ใน worktree อยู่แล้ว) · `VITE_USE_EMULATORS` ไม่ใช่ `false` · `VITE_APP_NAME` ≠ `my-boq-app` · rules live มีอะไรที่ repo ไม่มี (rule ที่มีคนแก้ใน Console เอง) — คุยก่อน

---

## ขั้น 1 — Web (hosting `site-02`)

**วัตถุประสงค์**: ขึ้นเว็บ 0.121.0 (Wall Run + Sheet Composer ผนัง) — ต้องก่อน rules เสมอ (เว็บ 0.121 ทำงานได้ทั้งกับ rules เก่าและใหม่)

```powershell
cd $wt
firebase hosting:clone cmg-boq-bbs:live cmg-boq-bbs:pre-0121 --project my-boq-app    # เก็บเวอร์ชันที่ live ไว้ใน channel (หมดอายุ 7 วัน)
firebase deploy --only hosting:site-02 --project my-boq-app
```

```powershell
$local = (Select-String -Path dist\index.html -Pattern 'assets/index-[^"]+\.js').Matches[0].Value
$live  = ((Invoke-WebRequest "https://cmg-boq-bbs.web.app/?nocache=$(Get-Random)" -Headers @{'Cache-Control'='no-cache'} -UseBasicParsing).Content | Select-String 'assets/index-[^"]+\.js').Matches[0].Value
"$local`n$live"     # ต้องเหมือนกัน
```

**สิ่งที่ต้องเห็น**: `Deploy complete!` · `$local` = `$live` · channel `pre-0121` ใน `firebase hosting:channel:list --site cmg-boq-bbs`

**Smoke test** (https://cmg-boq-bbs.web.app, Ctrl+F5):
1. Login ได้ (บัญชีปกติ + MasterAdmin)
2. เปิดโครงการ, เปิดสมาชิก 1 ตัว, ดู “แบบ & BBS”
3. สร้าง / เปิดผนัง → layout “Wall Run” → การ์ดชนิดผนัง → แผ่นผนัง (โหมด BBS ทั้งผนัง / ตามช่วงเท / ตามด้าน) → “จัดหน้าแบบ (Sheet Composer)” เปิดได้
4. เปิดพื้น (Slab floor) → แผ่นพื้นแสดงได้
5. “บันทึกเป็น Template” (Save as Template) เปิดหน้าต่างได้ (ยังไม่ต้องบันทึก)
6. Settings ของโครงการ › AI: “อนุญาตส่งแบบให้ AI” ยัง **ปิด** (ค่าเริ่มต้น) ในโครงการที่ไม่เคยเปิด
7. คู่มือ (F1) › “Wall Run” มีหัวข้อ

**Rollback**: `firebase hosting:clone cmg-boq-bbs:pre-0121 cmg-boq-bbs:live --project my-boq-app` (หรือ Console › Hosting › cmg-boq-bbs › Release history › ⋮ › Rollback)

**หยุดถ้า…** หน้าเว็บขาว / console error ตอนโหลด · login ไม่ได้ · เปิดโครงการเดิมไม่ได้ → rollback ทันที

---

## ขั้น 2 — Firestore + Storage rules

**วัตถุประสงค์**: rules ตามบทบาท (SEC1) + Template (T1) — ปิด API key จาก client, ปิดการเข้าถึงโครงการที่ไม่ได้รับมอบหมาย

```powershell
cd $wt
firebase deploy --only firestore:rules,storage --project my-boq-app
```

ครั้งแรกที่ Storage rules อ่าน Firestore (cross-service) CLI / Console จะถามให้ให้สิทธิ์ Storage service agent อ่าน Firestore → **ตอบ Yes**

**สิ่งที่ต้องเห็น**: `firestore: released rules firestore.rules to cloud.firestore` · `storage: released rules storage.rules to firebase.storage` · Console › Rules แสดงข้อความตรงกับไฟล์ใน repo

**Smoke test**:
1. MasterAdmin: login, เห็นทุกโครงการ, เปิดโครงการ + สมาชิก, บันทึกสมาชิก 1 ตัว (แก้แล้วบันทึก)
2. บัญชีที่ไม่ใช่ admin (เช่น qs): รายการโครงการ **เฉพาะที่ได้รับมอบหมาย** · เพิ่ม / บันทึกสมาชิกได้ · แนบไฟล์ PDF ได้ · Export PDF / Excel ได้
3. บัญชี viewer: เปิดได้, บันทึกสมาชิก **ไม่ได้** (ปุ่มปิด / ข้อความสิทธิ์)
4. เปิดไฟล์แบบที่แนบไว้เดิม (Storage read) ได้ · โลโก้โครงการแสดง
5. MasterAdmin › “จัดการ API” เปิดได้ (แสดง banner “API Key ยังเก็บในที่ที่เว็บอ่านได้” ถ้ายังไม่ได้ย้าย — ไปขั้น 3)
6. Save as Template (qs, โครงการ) บันทึกได้ · Template กลางเห็นได้
7. AI consent ยังปิดเป็นค่าเริ่มต้น

**Rollback**: Console › Firestore Database › Rules › History › เวอร์ชันก่อนหน้า › Publish (Storage เหมือนกัน) — หรือ

```powershell
cd $repo
Copy-Item docs\deploy-backup\firestore.rules.live-20261106 $wt\firestore.rules
Copy-Item docs\deploy-backup\storage.rules.live-20261106 $wt\storage.rules
cd $wt; firebase deploy --only firestore:rules,storage --project my-boq-app
git checkout -- firestore.rules storage.rules     # คืนไฟล์ใน worktree
```

**หยุดถ้า…** ผู้ใช้ปกติ (approved, มีโครงการ) เปิดโครงการไม่ได้ / `Missing or insufficient permissions` ในงานที่บทบาทนั้นควรทำได้ · ไฟล์เดิมใน Storage เปิดไม่ได้ (อาจมีไฟล์นอก `projects/{pid}/<folder ที่รู้จัก>/` — ตรวจใน Console › Storage ก่อน deploy ถ้าไม่แน่ใจ) → rollback rules แล้วส่ง path / ข้อความ error มาให้ตรวจ

---

## ขั้น 3 — ย้าย API keys เดิมไป `apiProviderSecrets/{provider}`

**วัตถุประสงค์**: เอา key ออกจาก `my-boq-app/root/apiProviders/config` (ที่ผู้ใช้ approved ทุกคนอ่านได้) ไปไว้ที่ client อ่านไม่ได้

ทางที่ 1 (ง่าย, ในแอป): MasterAdmin › จัดการ API › banner › **ย้าย API Key ไปที่เก็บลับ** (ไม่มี backup ในตัว — ไม่จำเป็น เพราะ key เก่าจะถูกเปลี่ยนในขั้น 6 อยู่แล้ว)

ทางที่ 2 (script, Admin SDK, มี backup) — ต้องมี Application Default Credentials ของ `my-boq-app`
(เครื่องนี้ไม่มี gcloud: ติดตั้ง Google Cloud SDK แล้ว `gcloud auth application-default login` หรือใช้ service account key ผ่าน `$env:GOOGLE_APPLICATION_CREDENTIALS`):

```powershell
cd $wt
node tools/security/migrateApiKeys.mjs --project my-boq-app                       # dry run (ค่าเริ่มต้น): แสดง provider ที่จะย้าย ไม่เขียน
node tools/security/migrateApiKeys.mjs --project my-boq-app --apply --backup $bk  # เขียน: backup JSON ก่อน แล้วย้าย
```

**สิ่งที่ต้องเห็น**: dry run `would move openai, …` · apply `backup: C:\Users\Administrator\boq-deploy-backup\migrateApiKeys-….json` + `moved …` · ในแอป banner หายไป, การ์ดแต่ละค่ายแสดง “ตั้งค่าแล้ว”

**Smoke test**: จัดการ API แสดง “ตั้งค่าแล้ว” · Console › Firestore: `apiProviders/config` ไม่มีฟิลด์ `apiKey` · มี `apiProviderSecrets/<provider>` · ปุ่ม AI (อ่านแบบ) ยังทำงาน (gateway เดิมอ่าน key จาก config — ถ้า AI ล้มหลังขั้นนี้ ให้ทำขั้น 5 ต่อเลย เพราะ gateway ใหม่อ่าน secret)

**Rollback**: `node tools/security/restoreBackup.mjs --project my-boq-app --file <ไฟล์ backup>` (dry run) แล้วเติม `--apply` · ทางที่ 1 ไม่มี backup → ใส่ key ใหม่ใน “จัดการ API” (ซึ่งต้องทำในขั้น 6 อยู่แล้ว)

**หยุดถ้า…** script บอก `the config changed after the backup` (มีคนแก้ระหว่างรัน — รันใหม่) · ไม่มี provider ใดเลยใน dry run แต่ banner ยังขึ้น (ส่งภาพมาให้ตรวจ)

ไฟล์ backup นี้มี API key จริง — อย่า commit อย่าแชร์ ลบทิ้งหลังขั้น 6

---

## ขั้น 4 — ย้าย Template เดิม (“เฉพาะโครงการนี้”) เข้าโครงการ

**วัตถุประสงค์**: เอกสาร `my-boq-app/root/elementTemplates/{id}` ที่ `scope: 'project'` → `projects/{projectId}/elementTemplates/{id}` (rules ใหม่ให้เฉพาะ MasterAdmin เขียนที่กลาง)

```powershell
cd $wt
node tools/security/migrateElementTemplates.mjs --project my-boq-app                        # dry run: log ทุก doc ที่จะ copy / ลบ
node tools/security/migrateElementTemplates.mjs --project my-boq-app --apply --backup $bk   # เขียน (backup ต้นฉบับ + ปลายทางก่อน)
node tools/security/migrateElementTemplates.mjs --project my-boq-app                        # รันซ้ำ: total 0
```

หรือในแอป: MasterAdmin › จัดการผู้ใช้งาน › “ย้าย Template เดิม (เฉพาะโครงการ) เข้าโครงการ” › **ตรวจก่อนย้าย** (= dry run) › **ย้ายเข้าโครงการ** (ไม่มีไฟล์ backup — ใช้ script ถ้าต้องการย้อนได้)

**สิ่งที่ต้องเห็น**: dry run แสดงแต่ละ template `→ projects/<pid>/elementTemplates/<id>` + `"conflicts": []` · apply `deleted` = `total` · รันซ้ำ `total 0`

**ผล dry run บน emulator** (`demo-boq-migrate`, log เต็ม `output/deploy-0121/migration-dry-run.log` ในเครื่องที่เตรียม):

| | ก่อน | หลัง apply | หลัง rollback |
|---|---|---|---|
| `apiProviders/config` | openai / anthropic: key ใน config | `hasApiKey` | key ใน config (Timestamp คืนเป็น Timestamp) |
| `apiProviderSecrets` | — | anthropic, openai | — |
| Template กลาง | t1 project v2 · t2 project v1 · t3 workspace v1 · t4 project v1 | t3 workspace v1 | เหมือนก่อน |
| `projects/pA/elementTemplates` | t4 v3 | t1 v2 (migrated) · t4 v3 (ของใหม่กว่าคงไว้, รายงานเป็น conflict) | t4 v3 |
| `projects/pB/elementTemplates` | — | t2 v1 (migrated) | — |

ตรวจ: dry run ไม่เขียนอะไร · `--apply` ที่ไม่มี `--backup` ถูกปฏิเสธ · รันซ้ำไม่เปลี่ยน · restore คืนทุก doc — รันเองได้:

```powershell
cd $wt
firebase emulators:exec --config tools/security/emu.firebase.json --only firestore --project demo-boq-migrate "node tools/security/migrationCheck.emu.mjs"
```

**Smoke test**: โครงการที่มี Template เดิม → “เพิ่มสมาชิก” เห็น Template ของโครงการ · Template กลางยังอยู่ · qs ของโครงการบันทึก Template ได้

**Rollback**: `node tools/security/restoreBackup.mjs --project my-boq-app --file $bk\migrateElementTemplates-<เวลา>.json` (dry run) แล้วเติม `--apply` (ลบสำเนาที่สร้างใหม่ คืนต้นฉบับกลาง)

**หยุดถ้า…** dry run มี `conflicts` (มีสำเนาในโครงการ version ใหม่กว่า — ต้นฉบับกลางจะถูกลบ ส่วนสำเนาคงไว้; ตรวจว่าตั้งใจ) · `copy missing … nothing deleted` (รันใหม่)

---

## ขั้น 5 — Functions (`analyseDrawing`, asia-southeast1)

**วัตถุประสงค์**: gateway ใหม่อ่าน key จาก `apiProviderSecrets` (fallback config) + task `slabPlan` (S4b) — ต้องใช้ `functions/lib/model-tools.cjs` จาก `npm run build` ของขั้น 0 ใน worktree เดียวกัน

```powershell
cd $wt
Test-Path functions\lib\model-tools.cjs     # True
firebase deploy --only functions:analyseDrawing --project my-boq-app
firebase functions:list --project my-boq-app
```

**สิ่งที่ต้องเห็น**: `Successful update operation` · `analyseDrawing v2 https asia-southeast1 … nodejs22`

**Smoke test**: โครงการที่เปิด AI consent (ทดสอบ) › อ่านแบบด้วย AI (สมาชิก Custom › “รูปทรง” › AI) ตอบกลับได้ · Console › Functions › Logs ไม่มี `412 ค่าย AI ที่เลือกยังไม่มี API Key`

**Rollback**: Google Cloud Console › Cloud Run › `analysedrawing` (asia-southeast1) › Revisions › Manage traffic › revision ก่อนหน้า 100 % — หรือ deploy โค้ดเดิม: `git -c core.longpaths=true worktree add --detach <โฟลเดอร์> <commit ที่ deploy อยู่>` → `npm ci; npm run build` → deploy (gateway เก่าอ่าน key จาก config เท่านั้น: ต้องใส่ key กลับใน config ด้วย restoreBackup ขั้น 3)

**หยุดถ้า…** deploy ฟ้อง runtime / dependency · AI ตอบ error ทุกครั้งหลัง deploy → rollback traffic แล้วส่ง log มา

---

## ขั้น 6 — หมุน (rotate) API keys

**วัตถุประสงค์**: key เก่าอาจถูกอ่านไปแล้วตอนที่ config ยังอ่านได้

1. สร้าง key ใหม่ที่ผู้ให้บริการแต่ละค่ายที่ใช้อยู่ (OpenAI / Anthropic / Google AI Studio)
2. MasterAdmin › จัดการ API › ใส่ key ใหม่ในการ์ดของค่ายนั้น › **บันทึกการตั้งค่า API** (เขียน `apiProviderSecrets`, key ไม่แสดงซ้ำ)
3. ทดสอบ AI (smoke test ด้านล่าง) **แล้ว** ลบ / revoke key เก่าที่ผู้ให้บริการ
4. ลบไฟล์ `$bk\migrateApiKeys-*.json` (มี key เก่า)

**Smoke test**: analyseDrawing ตอบได้ (เหมือนขั้น 5) หลังบันทึก key ใหม่ และหลัง revoke key เก่า

**Rollback**: ใส่ key ที่ใช้ได้ใน “จัดการ API” อีกครั้ง (ยังไม่ revoke key เก่าจนกว่า key ใหม่ผ่าน smoke test)

**หยุดถ้า…** AI error หลังใส่ key ใหม่ → ตรวจ key / โควตาที่ผู้ให้บริการก่อน revoke key เก่า

---

## ขั้น 7 — เปิด cover policy `rebar-bend-tolerance-1.0` ในโครงการเดิม (opt-in)

**วัตถุประสงค์**: โครงการ / profile ใหม่ได้ค่านี้อัตโนมัติ ส่วนของเดิมต้องเลือกเอง — ให้ขอ 135° ของ RB6 / RB9 ที่ชิด cover พอดี ตรวจผ่านตามจริง (คลาดได้ ≤ 0.001 mm เฉพาะส่วนดัด)

1. General Spec › profile ที่โครงการใช้ › ช่อง “วิธีตรวจระยะหุ้ม” (ท้ายหน้า): notice “มีวิธีตรวจใหม่ให้รับ” › **รับวิธีตรวจใหม่** (หรือเลือก “ส่วนดัดโค้งคลาดได้ ≤ 0.001 mm”) › บันทึก profile
2. โครงการที่ link กับ profile จะรัน spec-change job (สมาชิก gen-* สร้างใหม่) — รอจน job เสร็จ (หน้า Settings ของโครงการ)
3. โครงการที่ไม่ได้ link กับ profile: ตัวเลือกนี้อยู่ใน General Spec เท่านั้น → ตั้งโครงการให้ใช้ profile (Settings › แก้ไขโครงการ › General Spec) ที่รับวิธีตรวจใหม่แล้ว หรือปล่อยเป็นวิธีเดิม

**Smoke test**: สมาชิกที่เคยติด cover ที่ขอ 135° (เช่นคานจากพื้น S3 / RB9) ตรวจผ่าน · น้ำหนักเหล็กไม่เปลี่ยน (policy เปลี่ยนเฉพาะการตรวจ) · Frozen revision เดิมคงผลเดิม · `calculationEngine` ของสมาชิกที่สร้างใหม่ลงท้าย `+rebar-bend-tolerance-1.0`

**Rollback**: เลือกวิธีเดิมใน General Spec แล้วบันทึก (job รันอีกรอบ)

**หยุดถ้า…** job ค้าง / ล้ม (ดูหน้า job: resume / rollback) · น้ำหนักเปลี่ยน (ไม่ควรเกิด — ส่งชื่อสมาชิกมาให้ตรวจ)

---

## เก็บกวาด

```powershell
cd $repo
git worktree remove --force $wt
cmd /c rd /s /q "\\?\C:\Users\Administrator\boq-deploy-0121"     # ถ้ายังเหลือ (path ยาว)
firebase hosting:channel:delete pre-0121 --site cmg-boq-bbs --project my-boq-app   # หลังมั่นใจ (หรือปล่อยหมดอายุ 7 วัน)
```

Commit ไฟล์ rules ที่สำรองไว้ใน `docs/deploy-backup/` (ไม่มีข้อมูลลับ) ถ้าต้องการเก็บประวัติ · ห้าม commit ไฟล์ใน `$bk`
