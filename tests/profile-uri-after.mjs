import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium, admin, guard, login} from './auth-persistence-qa.mjs';

const out = 'output/profile-uri-verification', ctx = JSON.parse(await fs.readFile('tmp/profile-uri-context.json', 'utf8'));
const browser = await chromium.launch({headless: true}), contexts = [], cloud = [], errors = [], results = [];
const base = 'http://127.0.0.1:5306';
async function pageFor(user) {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}); contexts.push(context);
  const page = await context.newPage(); await guard(page, cloud, errors);
  await page.goto(base+'/tests/context-harness.html');
  await page.evaluate(async user => (await import('/src/auth/authService.ts')).loginWithEmail(user.email, user.password), user);
  return page;
}
async function read(page, pid, collection, id) {
  const result=await page.evaluate(async q => {try{return {value:await(await import('/src/data/projectReadback.ts')).readProjectRecord(q.pid,q.collection,q.id)};}catch(error){return {failure:error.code||'unknown'};}}, {pid, collection, id});
  if(result.failure)throw Object.assign(Error('QA read '+result.failure),{code:result.failure});return result.value;
}
async function call(page, action, pid, data = {}) {
  const result=await page.evaluate(async q => {try{return {value:await(await import('/src/data/firebase.ts')).command(q.action,q.pid,q.data)};}catch(error){return {failure:error.code||'unknown'};}}, {action, pid, data});
  if(result.failure)throw Object.assign(Error('QA command '+result.failure),{code:result.failure});return result.value;
}
async function complete(page, pid, state) {
  while (state.status === 'Applying') state = await call(page, 'advanceSpecChange', pid, {jobId: state.id});
  assert.equal(state.status, 'Complete'); return state;
}
try {
  const master = await pageFor(admin), users = [];
  for (const [index, user] of ctx.users.entries()) {
    const page = await pageFor(user); users.push(page);
    let profile = await page.evaluate(async () => (await import('/src/data/projectReadback.ts')).readOwnProfileRecord());
    if (profile.status !== 'pending') {
      await call(master,'updateUserProfile',undefined,{profile:{email:user.email,profileVersion:profile.profileVersion,status:'pending',roles:['Staff'],assignedProjects:[]}});
      profile = await page.evaluate(async () => (await import('/src/data/projectReadback.ts')).readOwnProfileRecord());
    }
    assert.equal(profile.email, user.email); assert.equal(profile.status, 'pending');
    const project = await call(master, 'createProject', undefined, {project: {code: `URI-${index}-${Date.now()}`, name: 'Profile URI SOFTWARE QA ONLY'}});
    const member = await master.evaluate(async pid => {
      const f = await import('/src/data/firebase.ts'), m = await import('/src/domain/model.ts'), q = await import('/src/domain/quantityBasis.ts');
      const member = m.blankMember('Custom', 'M-URI'); member.quantityBasis = q.provisionalQuantityBasis();
      member.occurrences[0].quantity = 2; member.occurrences[0].zone = 'Zone#1'; member.occurrences[0].floor = 'F?1';
      await f.command('saveMember', pid, {member}); return member;
    }, project.id);
    await call(master, 'updateUserProfile', undefined, {profile: {email: user.email, profileVersion: profile.profileVersion, status: 'approved', roles: ['qs'], assignedProjects: [project.id]}});
    const own = await page.evaluate(async () => (await import('/src/data/projectReadback.ts')).readOwnProfileRecord());
    assert.equal(own.status, 'approved'); assert.equal(own.uid, profile.uid);
    let current = await read(page, project.id);
    const area = await call(page, 'beginAreaChange', project.id, {version: current.version, field: 'zone', from: 'Zone#1', to: 'Zone?2', note: 'URI profile real API batch QA'});
    await complete(page, project.id, area);
    let actual = await read(page, project.id, 'members', member.id); assert.equal(actual.occurrences[0].zone, 'Zone?2');
    assert.equal(actual.occurrences[0].floor, 'F?1'); assert.equal(actual.occurrences[0].quantity, 2);
    current = await read(page, project.id);
    const batch = await call(page, 'beginOccurrenceBatch', project.id, {version: current.version, rows: [{memberId: member.id, occurrenceId: member.occurrences[0].id}], patch: {quantity: 3, floor: 'F#2'}, note: 'URI profile occurrence quantity QA'});
    await complete(page, project.id, batch);
    actual = await read(page, project.id, 'members', member.id); assert.equal(actual.occurrences[0].quantity, 3); assert.equal(actual.occurrences[0].floor, 'F#2');
    assert.equal(actual.quantityBasis.state, 'Provisional'); assert.equal(actual.status, 'Draft');
    const pages = await page.evaluate(async pid => {
      const api = await import('/src/data/projectReadback.ts');
      const own = await api.readProjectPage(pid, 'members');
      return {memberCount: own.records.length};
    }, project.id);
    assert.equal(pages.memberCount, 1);
    ctx.users[index] = {...user, pid: project.id, memberId: member.id};
    results.push({marker: index ? '?' : '#', pendingOwnProfileReads: true, approvedUidBindingRetained: true, areaChangeCommitted: true, occurrenceQuantityFloorCommitted: true, sameScopePageRead: true});
  }
  for (const [index, page] of users.entries()) {
    let denied = false;
    try {await read(page, ctx.users[1 - index].pid);} catch (error) {denied = error.code === 'permission-denied';}
    assert.equal(denied, true);
    const before = await read(master, ctx.users[1 - index].pid);
    try {await call(page, 'beginAreaChange', before.id, {version: before.version, field: 'zone', from: 'Zone?2', to: 'OTHER', note: 'Must deny cross-project'}); assert.fail('Cross-project command succeeded');} catch (error) {assert.equal(error.code, 'permission-denied');}
    assert.deepEqual(await read(master, before.id), before);
  }
  const normal = await master.evaluate(async () => (await import('/src/data/projectReadback.ts')).readOwnProfileRecord()); assert.equal(normal.status, 'approved');
  const directory = await master.evaluate(async () => (await import('/src/data/projectReadback.ts')).readProjectDirectoryPage());
  assert.ok(ctx.users.every(user=>directory.records.some(project=>project.id===user.pid)));
  await fs.writeFile('tmp/profile-uri-context.json', JSON.stringify(ctx));
  const uiContext = await browser.newContext({viewport: {width: 1440, height: 1000}}); contexts.push(uiContext);
  const ui = await uiContext.newPage(); await guard(ui, cloud, errors); await ui.goto(base); await login(ui, ctx.users[0]);
  await ui.locator(`[data-project-id="${ctx.users[0].pid}"]`).waitFor();assert.equal(await ui.locator('[data-project-id]').count(), 1); await ui.locator(`[data-project-id="${ctx.users[0].pid}"]`).click();
  await ui.locator('nav').getByRole('button', {name: /^องค์ประกอบอื่น/}).click(); await ui.locator('.member-title h2').filter({hasText: 'M-URI'}).waitFor();
  await ui.screenshot({path: `${out}/qs-member.png`}); await ui.setViewportSize({width: 390, height: 844}); assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); await ui.screenshot({path: `${out}/qs-mobile.png`, fullPage: true});
  assert.deepEqual(cloud, []); assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/after-results.json`, JSON.stringify({status: 'PASS', results, ordinaryProfileStillReads: true, ownProjectOnly: true, crossProjectReadAndCommandDeniedWithoutWrites: true, actualQsUiAndMobile: true, engineeringApproval: false, productionRequests: false}, null, 2)); console.log('PASS real reserved-character profile/API area+occurrence batches, project isolation, QS UI/mobile');
} finally {for (const context of contexts) await context.close(); await browser.close();}
