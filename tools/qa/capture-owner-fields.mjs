import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Preserve the live demo database by small read-only pages before any service repair.
// This is a field-level capture, not a native Firestore export.
const target = path.resolve('tmp/original-rpc-diagnostic/captures', randomUUID());
await fs.mkdir(target, {recursive: true});
const base = 'http://127.0.0.1:8751/v1/projects/demo-boq-v041/databases/(default)/documents';
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
let retries = 0;
async function request(resource, options = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(base + resource, {...options, headers: {Authorization: 'Bearer owner', 'Content-Type': 'application/json'}, signal: AbortSignal.timeout(10000)});
      if (!response.ok) throw Error(`Local field capture HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      last = error;
      if (attempt < 2) {retries++; await new Promise(resolve => setTimeout(resolve, 200));}
    }
  }
  await fs.writeFile(path.join(target, 'failure-context.json'), JSON.stringify({resource, message: last?.message}, null, 2));
  throw last;
}
async function inventory(pass) {
  const queue = [''], records = [], missing = [], visited = new Set(), seen = new Set();
  const capture = path.join(target, `pass-${pass}.ndjson`);
  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i]; assert.ok(!visited.has(parent)); visited.add(parent);
    let collectionToken;
    do {
      const list = await request(parent + ':listCollectionIds', {method: 'POST', body: JSON.stringify({pageSize: 5, ...(collectionToken ? {pageToken: collectionToken} : {})})});
      for (const collection of list.collectionIds || []) {
        let token;
        do {
          const body = await request(`${parent}/${encodeURIComponent(collection)}?pageSize=1&showMissing=true${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
          for (const doc of body.documents || []) {
            const relative = '/' + doc.name.split('/documents/')[1];
            assert.ok(relative.length > 1 && !seen.has(relative)); seen.add(relative); queue.push(relative);
            if (doc.fields || doc.createTime) {records.push({path: relative, fields: doc.fields || {}}); await fs.appendFile(capture, JSON.stringify(doc) + '\n');}
            else missing.push(relative);
            assert.ok(queue.length <= 20000, 'Bounded known local QA scope');
          }
          token = body.nextPageToken;
        } while (token);
      }
      collectionToken = list.nextPageToken;
    } while (collectionToken);
    if (i % 50 === 0) console.log(`Read-only pass ${pass}: ${records.length} documents, ${i + 1} paths traversed`);
  }
  records.sort((a, b) => a.path.localeCompare(b.path)); missing.sort();
  const result = {documents: records.length, missingParents: missing.length, fieldsDigest: hash(records), missingDigest: hash(missing)};
  await fs.writeFile(path.join(target, `pass-${pass}-summary.json`), JSON.stringify(result, null, 2));
  return result;
}
const before = await inventory(1), after = await inventory(2);
assert.deepEqual(after, before, 'Complete two-pass fields/missing-parent capture must match');
await fs.writeFile('tmp/original-rpc-diagnostic/latest-field-capture.json', JSON.stringify({target, projectId: 'demo-boq-v041', ...after}, null, 2));
const report = {status: 'PASS', scope: 'Current local QA document fields; native export and metadata restoration are not claimed', ...after, retries, completeTwoPassAgreement: true, rawProfileAndAclDataPrivate: true, servicesRestarted: false, writesToDatabase: false, productionRequests: false};
await fs.writeFile('output/original-rpc-diagnostic/field-capture-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
