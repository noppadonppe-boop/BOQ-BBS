import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createHash, randomUUID} from 'node:crypto';
import {chromium, admin, guard, login, logout} from './auth-persistence-qa.mjs';

const out = 'output/deferred-workspace-verification';
const manifest = JSON.parse(await fs.readFile(`${out}/dist/.vite/manifest.json`, 'utf8'));
const six = JSON.parse(await fs.readFile('tmp/six-category-current-context.json', 'utf8'));
const c1 = JSON.parse(await fs.readFile('tmp/component-quantity-context.json', 'utf8'));
const url = 'http://127.0.0.1:5304';
const labels = {Foundation: 'ฐานราก', Beam: 'คาน', Column: 'เสา', Slab: 'พื้น', Wall: 'ผนัง', Custom: 'องค์ประกอบอื่น'};
const browser = await chromium.launch({headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const cloud = [], errors = [];
const contexts = [];
async function newPage() {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  contexts.push(context);
  const page = await context.newPage();
  await guard(page, cloud, errors);
  return {page, context};
}
const requested = page => {
  const assets = new Set();
  page.on('request', request => {
    const value = new URL(request.url());
    if (value.pathname.startsWith('/assets/') && value.pathname.endsWith('.js')) assets.add(value.pathname.slice(1));
  });
  return assets;
};
async function bytes(assets, dir) {
  let raw = 0, gzip = 0;
  for (const asset of assets) {
    const value = await fs.readFile(path.join(dir, asset));
    raw += value.length; gzip += gzipSync(value).length;
  }
  return {requests: assets.size, rawBytes: raw, gzipBytes: gzip};
}
async function openProject(page, fixture) {
  if (await page.locator('nav').count()) await page.locator('.brand').click();
  await page.getByPlaceholder('ค้นหาโครงการ', {exact: true}).fill(fixture.code);
  await page.locator(`[data-project-id="${fixture.pid}"]`).click();
  await page.locator('nav').waitFor();
}
const file = key => manifest[key]?.file;
const exportAsset = Object.entries(manifest).find(([key]) => key.startsWith('_exports-'))?.[1].file;
const optional = [file('src/components/Editors.tsx'), file('src/components/Delivery.tsx'), file('src/components/BackupRestorePanel.tsx'), file('src/components/CostReport.tsx'), file('src/components/ModelView.tsx'), exportAsset];
assert.ok(optional.every(Boolean), 'Expected lazy chunks must be present in the built manifest');

try {
  // Compare actual cold guest and project navigation requests against the prior compiled app.
  const {page: before} = await newPage(), oldAssets = requested(before);
  await before.goto('http://127.0.0.1:5303/login');
  await before.getByLabel('อีเมล', {exact: true}).waitFor();
  const previousGuest = await bytes(oldAssets, 'output/component-quantity-verification/dist');
  await login(before, admin); await openProject(before, six);
  const previousOverview = await bytes(oldAssets, 'output/component-quantity-verification/dist');
  await before.close();

  const {page, context} = await newPage(), assets = requested(page);
  await page.goto(`${url}/login`); await page.getByLabel('อีเมล', {exact: true}).waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  const currentGuest = await bytes(assets, `${out}/dist`);
  for (const asset of optional) assert.equal(assets.has(asset), false, `guest: ${asset}`);
  assert.ok(currentGuest.gzipBytes < previousGuest.gzipBytes * .7, 'Guest gzip JS should materially decrease');
  await login(page, admin); await openProject(page, six);
  const currentOverview = await bytes(assets, `${out}/dist`);
  for (const asset of optional) assert.equal(assets.has(asset), false, `overview: ${asset}`);
  assert.ok(currentOverview.gzipBytes < previousOverview.gzipBytes, 'Overview must not regress total requested gzip JS');
  await fs.writeFile(`${out}/load-metrics.json`, JSON.stringify({previousGuest, currentGuest, previousOverview, currentOverview}, null, 2));
  await page.screenshot({path: `${out}/project-overview.png`});

  // Hold the actual editor request to verify visible loading and retained project navigation.
  let release;
  const gate = new Promise(resolve => {release = resolve;});
  const editorUrl = `${url}/${file('src/components/Editors.tsx')}`;
  await page.route(editorUrl, async route => {await gate; await route.continue();});
  await page.locator('nav').getByRole('button', {name: /^ฐานราก/}).click();
  await page.getByRole('status').filter({hasText: 'กำลังเปิดสมาชิกและ BBS'}).waitFor();
  assert.equal(await page.locator('nav').isVisible(), true);
  await page.screenshot({path: `${out}/editor-loading.png`});
  release(); await page.unroute(editorUrl);
  for (const member of six.members) {
    await page.locator('nav').getByRole('button', {name: new RegExp('^' + labels[member.category])}).click();
    await page.locator('.member-title h2').filter({hasText: member.code}).waitFor();
    assert.equal(await page.locator('.bbs tbody tr').count(), 1);
    assert.equal(await page.locator('.bbs tbody tr td').nth(6).innerText(), String(2 * member.occurrences.reduce((n, o) => n + o.quantity, 0)));
    await page.getByRole('button', {name: '3D', exact: true}).click();
    await page.locator('.model-canvas canvas').waitFor();
    await page.locator('.view-tools').getByRole('button', {name: 'X', exact: true}).click();
    await page.locator('.view-tools').getByRole('button', {name: 'ISO', exact: true}).click();
    await page.locator('.member-title').getByRole('button', {name: 'แก้มิติ / ตำแหน่ง', exact: true}).click();
    await page.locator('.modal').getByRole('button', {name: 'ปิด', exact: true}).click();
  }
  assert.ok(assets.has(file('src/components/ModelView.tsx')));
  assert.equal(assets.has(exportAsset), false, 'Member navigation must not load the export pipeline');
  await page.screenshot({path: `${out}/member-with-3d.png`});
  await page.locator('nav').getByRole('button', {name: 'BOQ Summary', exact: true}).click();
  await page.locator('.quantity-report').waitFor();
  assert.equal(assets.has(file('src/components/CostReport.tsx')), false);
  await page.getByRole('button', {name: 'ประมาณราคา BOQ', exact: true}).click();
  await page.locator('.cost-report').waitFor();
  assert.ok(assets.has(file('src/components/CostReport.tsx')));

  await openProject(page, c1);
  await page.locator('nav').getByRole('button', {name: 'BOQ Summary', exact: true}).click();
  const total = page.locator('.quantity-report tbody tr.total');
  await total.waitFor();
  assert.equal((await total.locator('td').nth(2).innerText()).trim(), '78');
  assert.equal((await total.locator('td').nth(3).innerText()).trim(), '252.252');
  assert.match(await total.locator('td').nth(4).innerText(), /รอยืนยัน/);
  await page.screenshot({path: `${out}/partial-boq.png`});
  await page.locator('nav').getByRole('button', {name: 'แบบส่งงาน', exact: true}).click();
  await page.getByRole('heading', {name: 'Revision ที่ตรึงไว้', exact: true}).waitFor();
  assert.ok(assets.has(file('src/components/Delivery.tsx')));
  assert.ok(assets.has(exportAsset));
  const artifact = c1.componentArtifacts[0];
  const row = page.locator('tr').filter({hasText: artifact.sha256.slice(0, 16)});
  const [download] = await Promise.all([page.waitForEvent('download'), row.getByRole('button', {name: 'ดาวน์โหลด', exact: true}).click()]);
  const downloaded = await fs.readFile(await download.path());
  assert.equal(createHash('sha256').update(downloaded).digest('hex'), artifact.sha256);
  await page.locator('nav').getByRole('button', {name: 'โครงการ & สำรองข้อมูล', exact: true}).click();
  await page.locator('.backup-restore-panel').waitFor();
  assert.ok(assets.has(file('src/components/BackupRestorePanel.tsx')));

  await page.reload(); await page.locator('.top-profile').waitFor();
  const tab = await context.newPage(); await guard(tab, cloud, errors);
  await tab.goto(url); await tab.locator('.top-profile').waitFor();
  await logout(page); await tab.getByLabel('อีเมล', {exact: true}).waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');

  // A real pending registration never requests the workspace, editor or export chunks.
  const {page: pending} = await newPage(), pendingAssets = requested(pending);
  await pending.goto(`${url}/register`);
  const qaEmail = `deferred-${randomUUID()}@form.local`, qaPassword = 'QA-' + randomUUID();
  for (const [label, value] of [['ชื่อ', 'Deferred'], ['นามสกุล', 'Software QA'], ['ตำแหน่ง', 'Local test'], ['อีเมล', qaEmail], ['รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)', qaPassword]]) await pending.getByLabel(label, {exact: true}).fill(value);
  await pending.getByRole('button', {name: 'สร้างบัญชี', exact: true}).click();
  await pending.getByRole('heading', {name: 'รอ MasterAdmin อนุมัติ', exact: true}).waitFor();
  assert.equal(new URL(pending.url()).pathname, '/pending');
  assert.deepEqual([...pendingAssets].sort(), [...assets].filter(asset => asset === manifest['index.html'].file).sort());
  await pending.screenshot({path: `${out}/pending-account.png`});
  await pending.setViewportSize({width: 390, height: 844});
  assert.equal(await pending.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  // Existing error boundary recovers a failed lazy request through reload with SDK session retained.
  const {page: recovery} = await newPage(); await recovery.goto(url); await login(recovery, admin); await openProject(recovery, six);
  await recovery.route(editorUrl, route => route.abort());
  await recovery.locator('nav').getByRole('button', {name: /^ฐานราก/}).click();
  await recovery.getByRole('heading', {name: 'เปิด FORM ไม่สำเร็จ', exact: true}).waitFor();
  await recovery.unroute(editorUrl);
  await recovery.getByRole('button', {name: 'โหลดหน้าใหม่', exact: true}).click();
  await recovery.locator('.top-profile').waitFor(); await openProject(recovery, six);
  await recovery.locator('nav').getByRole('button', {name: /^ฐานราก/}).click();
  await recovery.locator('.member-title h2').waitFor();
  await recovery.setViewportSize({width: 390, height: 844});
  assert.equal(await recovery.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await recovery.screenshot({path: `${out}/member-mobile.png`, fullPage: true});
  const intentional = errors.filter(error => /Failed to fetch dynamically imported module/.test(error));
  // React may handle the rejected import entirely inside the error boundary,
  // without emitting an uncaught pageerror; the visible recovery flow was asserted above.
  assert.ok(intentional.length <= 1);
  assert.deepEqual(errors.filter(error => !intentional.includes(error)), []);
  assert.deepEqual(cloud, []);
  const result = {status: 'PASS', previousGuest, currentGuest, previousOverview, currentOverview, delayedEditorKeepsNavigation: true, sixCategoryEditorsBbsAnd3dMounted: true, pricingOnDemand: true, c1ReviewedCountAndConcretePreserved: true, existingExportDownloadChecksum: true, backupPanelOnDemand: true, sessionReloadAndCrossTabLogout: true, actualPendingRegistrationNoWorkspaceRequest: true, failedChunkReloadRecovery: true, mobileNoHorizontalOverflow: true, productionRequests: false, engineeringApproval: false, deployments: false};
  await fs.writeFile(`${out}/ui-results.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
