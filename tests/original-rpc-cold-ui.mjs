import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium, admin, guard, login} from './auth-persistence-qa.mjs';

const out = 'output/original-rpc-diagnostic';
const fixture = JSON.parse(await fs.readFile('tmp/six-category-current-context.json', 'utf8'));
const browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1440, height: 1000}}), cloud = [], errors = [];
const labels = {Foundation: 'ฐานราก', Beam: 'คาน', Column: 'เสา', Slab: 'พื้น', Wall: 'ผนัง', Custom: 'องค์ประกอบอื่น'};
try {
  await guard(page, cloud, errors);
  await page.goto('http://127.0.0.1:5305'); await login(page, admin);
  await page.getByPlaceholder('ค้นหาโครงการ', {exact: true}).fill(fixture.code);
  await page.locator(`[data-project-id="${fixture.pid}"]`).click();
  for (const member of fixture.members) {
    await page.locator('nav').getByRole('button', {name: new RegExp('^' + labels[member.category])}).click();
    await page.locator('.member-title h2').filter({hasText: member.code}).waitFor();
    assert.equal(await page.locator('.bbs tbody tr').count(), 1);
    assert.equal(await page.locator('.bbs tbody tr td').nth(6).innerText(), String(2 * member.occurrences.reduce((n, o) => n + o.quantity, 0)));
  }
  const signed = await page.evaluate(async fixture => {
    const f = await import('/src/data/firebase.ts'), h = await import('/tests/direct-browser-harness.ts');
    const results = [];
    for (const member of fixture.members) {
      const read = await h.getDocFromServer(h.doc(f.db, 'projects', fixture.pid, 'members', member.id));
      results.push(read.exists());
    }
    const token = await f.auth.currentUser.getIdToken();
    const denied = await fetch(`http://127.0.0.1:8971/v1/projects/demo-boq-v041/databases/(default)/documents/projects/${fixture.pid}`);
    const profile = (await import('/src/domain/auth.ts')).userDocPath(f.auth.currentUser.email);
    const batch = await fetch('http://127.0.0.1:8971/v1/projects/demo-boq-v041/databases/(default)/documents:batchGet', {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({documents: ['projects/demo-boq-v041/databases/(default)/documents/' + profile]})});
    return {members: results, anonymousProjectStatus: denied.status, profileBatchStatus: batch.status};
  }, fixture);
  assert.ok(signed.members.every(Boolean)); assert.equal(signed.anonymousProjectStatus, 403); assert.equal(signed.profileBatchStatus, 200);
  await page.locator('nav').getByRole('button', {name: 'BOQ Summary', exact: true}).click();
  const total = page.locator('.quantity-report tbody tr.total'); await total.waitFor();
  assert.equal((await total.locator('td').nth(2).innerText()).trim(), '33');
  assert.equal((await total.locator('td').nth(3).innerText()).trim(), '72.048');
  assert.equal((await total.locator('td').nth(4).innerText()).trim(), '549.280');
  await page.screenshot({path: `${out}/cold-six-category-boq.png`});
  await page.locator('nav').getByRole('button', {name: 'แบบส่งงาน', exact: true}).click();
  await page.getByRole('heading', {name: 'Revision ที่ตรึงไว้', exact: true}).waitFor();
  let downloads = 0;
  for (const artifact of fixture.artifacts) {
    const row = page.locator('tr').filter({hasText: artifact.sha256.slice(0, 16)});
    const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', {name: 'ดาวน์โหลด', exact: true}).click()]);
    const bytes = await fs.readFile(await download.path());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256); downloads++;
  }
  assert.equal(downloads, 3);
  await page.locator('nav').getByRole('button', {name: 'โครงการ & สำรองข้อมูล', exact: true}).click();
  await page.locator('.backup-restore-panel').waitFor();
  await page.reload(); await page.locator('.top-profile').waitFor();
  await page.setViewportSize({width: 390, height: 844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({path: `${out}/cold-projects-mobile.png`, fullPage: true});
  assert.deepEqual(cloud, []); assert.deepEqual(errors, []);
  const result = {status: 'PASS', coldNativeDatabaseAppLogin: true, signedSdkSixMemberReads: true, signedProfileBatchRead: true, anonymousProjectReadDenied: true, sixCategoryBbsCounts: true, syntheticReviewedCount33Concrete72_048Formwork549_280: true, originalRegisteredExportsChecksumDownloads: downloads, existingStorageReusedReadOnly: true, backupPanelMountedOnly: true, freshAppBackupRestoreNotClaimed: true, mobileNoHorizontalOverflow: true, originalFirestoreWritten: false, engineeringApprovalNotGranted: true, productionRequests: false};
  await fs.writeFile(`${out}/cold-ui-results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {await browser.close();}
