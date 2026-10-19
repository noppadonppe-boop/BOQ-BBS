import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium, admin, guard, login} from './auth-persistence-qa.mjs';

const out = 'output/full-current-cold-verification';
const objects = JSON.parse(await fs.readFile('tmp/full-current-cold-qa/objects.json', 'utf8'));
const source = JSON.parse(await fs.readFile('tmp/full-current-cold-qa/imported-inventory.json', 'utf8'));
const fixture = JSON.parse(await fs.readFile('tmp/six-category-current-context.json', 'utf8'));
const restored = JSON.parse(await fs.readFile('tmp/original-rpc-backup-context.json', 'utf8'));
const value = v => v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, value(x)])) : v.arrayValue ? (v.arrayValue.values || []).map(value) : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue : 'booleanValue' in v ? v.booleanValue : 'nullValue' in v ? null : v.stringValue || v.timestampValue;
const refs = new Map();
function visit(v) {
  if (!v || typeof v !== 'object') return;
  if (typeof v.path === 'string' && /^[0-9a-f]{64}$/.test(v.sha256 || '')) {
    const old = refs.get(v.path); assert.ok(!old || old === v.sha256, 'Immutable path has conflicting saved hashes'); refs.set(v.path, v.sha256);
  }
  for (const child of Object.values(v)) visit(child);
}
for (const record of source.records) visit(value({mapValue: {fields: record.fields}}));
for (const [name, sha] of refs) {
  const object = objects.find(o => o.path === name); assert.ok(object, 'Registered reference must exist in the capture');
  assert.equal(object.sha256, sha, 'Registered reference must match captured bytes');
}
const browser = await chromium.launch({headless: true}), page = await browser.newPage({viewport: {width: 1440, height: 1000}}), cloud = [], errors = [];
try {
  await guard(page, cloud, errors); await page.goto('http://127.0.0.1:5305'); await login(page, admin);
  const reads = await page.evaluate(async objects => {
    const f = await import('/src/data/firebase.ts'), h = await import('/tests/direct-browser-harness.ts'), {sha256} = await import('/src/data/snapshots.ts');
    if (!f.emulator || f.db.app.options.projectId !== 'demo-boq-v041') throw Error('Local demo only');
    const result = [];
    for (let i = 0; i < objects.length; i += 3) result.push(...await Promise.all(objects.slice(i, i + 3).map(async object => {
      try {
        const ref = h.ref(f.storage, `gs://${object.bucket}/${object.path}`);
        const blob = await h.getBlob(ref);
        return {path: object.path, sha256: await sha256(await blob.arrayBuffer()), size: blob.size};
      } catch (error) {return {path: object.path, denied: error.code || 'unknown'};}
    })));
    return result;
  }, objects);
  for (const read of reads) {assert.ok(!read.denied, 'Current QA account should read the preserved project objects'); const expected = objects.find(o => o.path === read.path); assert.equal(read.sha256, expected.sha256); assert.equal(read.size, expected.size);}
  await page.getByPlaceholder('ค้นหาโครงการ', {exact: true}).fill(fixture.code); await page.locator(`[data-project-id="${fixture.pid}"]`).click();
  await page.locator('nav').getByRole('button', {name: 'BOQ Summary', exact: true}).click();
  const total = page.locator('.quantity-report tbody tr.total'); await total.waitFor();
  assert.equal((await total.locator('td').nth(2).innerText()).trim(), '33'); assert.equal((await total.locator('td').nth(3).innerText()).trim(), '72.048');
  await page.screenshot({path: `${out}/cold-complete-boq.png`});
  await page.locator('.brand').click();
  const restoredProject = source.records.find(r => r.path === `/projects/${restored.restorePid}`); assert.ok(restoredProject);
  const code = value(restoredProject.fields.code);
  await page.getByPlaceholder('ค้นหาโครงการ', {exact: true}).fill(code); await page.locator(`[data-project-id="${restored.restorePid}"]`).click();
  await page.locator('nav').getByRole('button', {name: 'BOQ Summary', exact: true}).click();
  await page.locator('.quantity-report').waitFor(); assert.match(await page.locator('.quantity-report .kpis').innerText(), /รอยืนยัน/);
  assert.equal(await page.locator('.quantity-report tbody tr:not(.total)').count(), 6);
  await page.screenshot({path: `${out}/cold-restored-provisional.png`});
  await page.setViewportSize({width: 390, height: 844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path: `${out}/cold-restored-mobile.png`, fullPage: true});
  const unsigned = await fetch('http://127.0.0.1:8971/v1/projects/demo-boq-v041/databases/(default)/documents/projects/' + fixture.pid); assert.equal(unsigned.status, 403);
  assert.deepEqual(cloud, []); assert.deepEqual(errors, []);
  const result = {status: 'PASS', freshLoginAfterAuthImport: true, signedSdkObjectReadCount: reads.length, registeredReferenceChecks: refs.size, allRegisteredReferenceBytesPresentAndExact: true, completeSourceFixture33And72_048Retained: true, sixRestoredMembersRemainProvisional: true, originalInputReviewNotEngineeringApproval: true, anonymousProjectReadDenied: true, mobileNoHorizontalOverflow: true, applicationBusinessWrites: false, productionRequests: false, originalSessionContinuityNotClaimed: true};
  await fs.writeFile(`${out}/sdk-ui-results.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally {await browser.close();}
