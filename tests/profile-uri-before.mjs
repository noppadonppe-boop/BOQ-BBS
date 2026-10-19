import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium, guard} from './auth-persistence-qa.mjs';

const out = 'output/profile-uri-verification';
await fs.mkdir(out, {recursive: true});
const browser = await chromium.launch({headless: true}), contexts = [], cloud = [], errors = [], users = [], results = [];
try {
  for (const marker of ['#', '?']) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); await guard(page, cloud, errors);
    await page.goto('http://127.0.0.1:5291/tests/context-harness.html');
    const user = {email: `profile${marker}${randomUUID()}@form.local`, password: 'QA-' + randomUUID()};
    const result = await page.evaluate(async user => {
      const f = await import('/src/data/firebase.ts'), h = await import('/tests/direct-browser-harness.ts');
      if (!f.emulator || f.db.app.options.projectId !== 'demo-boq-v041') throw Error('Local only');
      const service = await import('/src/auth/authService.ts');
      const profile = await service.registerWithEmail(user.email, user.password, 'URI', 'Software QA', 'Local test');
      const name = (await import('/src/domain/auth.ts')).userDocPath(user.email);
      const sdk = await h.getDocFromServer(h.doc(f.db, name));
      let apiSucceeded = false, code;
      try { const api = await (await import('/src/data/projectReadback.ts')).readOwnProfileRecord(); apiSucceeded = api.uid === profile.uid; }
      catch (error) {code = error.code || 'not-found';}
      return {sdkOwnUidMatches: sdk.data()?.uid === profile.uid, state: profile.status, apiSucceeded, code};
    }, user);
    assert.equal(result.sdkOwnUidMatches, true); assert.equal(result.state, 'pending'); assert.equal(result.apiSucceeded, false);
    users.push(user); results.push({marker, sdkOwnUidMatches: true, pending: true, oldApiFails: true, code: result.code});
  }
  await fs.writeFile('tmp/profile-uri-context.json', JSON.stringify({users}));
  assert.deepEqual(cloud, []); assert.deepEqual(errors, []);
  await fs.writeFile(`${out}/before-results.json`, JSON.stringify({status: 'REPRODUCED', results, productionRequests: false, rulesChanged: false}, null, 2));
  console.log('REPRODUCED valid #/? accounts: SDK own profile succeeds, current authenticated REST profile read fails');
} finally {for (const context of contexts) await context.close(); await browser.close();}
