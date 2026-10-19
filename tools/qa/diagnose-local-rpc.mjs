import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Bounded read-only diagnostics for the two known demo environments. Never deploy or restart.
const project = 'demo-boq-v041';
const {admin} = await import('../../tests/auth-persistence-qa.mjs');
const fixture = JSON.parse(await fs.readFile('tmp/six-category-current-context.json', 'utf8'));
assert.match(fixture.pid, /^[a-zA-Z0-9_-]{1,80}$/);
const profile = `my-boq-app/root/users/${admin.email.toLowerCase()}`;
const member = `projects/${fixture.pid}/members/${fixture.members[0].id}`;
const results = [];
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function request(port, resource, token, options = {}) {
  assert.ok([10121, 11321, 8751, 8851].includes(port));
  try {
    const response = await fetch(`http://127.0.0.1:${port}${resource}`, {
      ...options,
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = {}; }
    return {status: response.status, body};
  } catch (error) { return {status: 'transport-error', error: error.name}; }
}
for (const [label, authPort, firestorePort] of [['original', 10121, 8751], ['independent', 11321, 8851]]) {
  const signIn = await request(authPort, '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', null, {method: 'POST', body: JSON.stringify({email: admin.email, password: admin.password, returnSecureToken: true})});
  assert.equal(signIn.status, 200, `${label} local QA login`);
  const token = signIn.body.idToken;
  assert.equal(typeof token, 'string');
  const base = `/v1/projects/${project}/databases/(default)/documents`;
  const known = [['profile', profile], ['project', `projects/${fixture.pid}`], ['member', member]];
  for (const [kind, relative] of known) {
    const owner = await request(firestorePort, `${base}/${relative}`, 'owner');
    const signed = await request(firestorePort, `${base}/${relative}`, token);
    const anonymous = await request(firestorePort, `${base}/${relative}`, null);
    results.push({environment: label, operation: `get-${kind}`, owner: owner.status, signed: signed.status, anonymous: anonymous.status, fieldsAgree: owner.status === 200 && signed.status === 200 ? sha(owner.body.fields) === sha(signed.body.fields) : null});
    const batch = await request(firestorePort, `${base}:batchGet`, token, {method: 'POST', body: JSON.stringify({documents: [`projects/${project}/databases/(default)/documents/${relative}`]})});
    results.push({environment: label, operation: `batchGet-${kind}`, signed: batch.status, errorStatus: batch.body?.error?.status || null, returnedDocuments: Array.isArray(batch.body) ? batch.body.filter(item => item.found).length : null});
  }
}
await fs.mkdir('output/original-rpc-diagnostic', {recursive: true});
const report = {status: 'OBSERVED', project: 'local demo only', results, readOnly: true, secretsOmitted: true, deployments: false, servicesRestarted: false, productionRequests: false};
await fs.writeFile('output/original-rpc-diagnostic/read-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
