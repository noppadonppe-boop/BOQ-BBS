import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Import only into the newly empty, separate demo Firestore on 8951.
const source = 'tmp/original-rpc-diagnostic/heap-63964-20261014/live-database.json';
const captured = JSON.parse(await fs.readFile(source, 'utf8'));
const cold = process.argv.includes('--cold');
const port = cold ? 8971 : 8951;
const base = `http://127.0.0.1:${port}/v1/projects/demo-boq-v041/databases/(default)/documents`;
const prefix = 'projects/demo-boq-v041/databases/(default)/documents/';
const normalize = v => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? 'nullValue' in v ? {nullValue: 'NULL_VALUE'} : 'arrayValue' in v ? {arrayValue: {values: normalize(v.arrayValue.values || [])}} : 'mapValue' in v ? {mapValue: {fields: normalize(v.mapValue.fields || {})}} : 'timestampValue' in v ? {timestampValue: v.timestampValue.replace(/(?:\.(\d+))?Z$/, (_, n) => '.' + (n || '').padEnd(9, '0') + 'Z')} : Object.fromEntries(Object.keys(v).sort().map(k => [k, normalize(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
assert.equal(captured.documents.length, 581); assert.equal(captured.deletedNames.length, 18);
const byName = new Map(captured.documents.map(item => [item.document.name, item.document]));

// Compare independently read original root documents from before the heap capture.
const captureRoot = 'tmp/original-rpc-diagnostic/captures';
const partials = [];
for (const dir of await fs.readdir(captureRoot)) {
  const file = path.join(captureRoot, dir, 'pass-1.ndjson');
  try { partials.push((await fs.readFile(file, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))); } catch (error) {if (error.code !== 'ENOENT') throw error;}
}
const control = partials.sort((a, b) => b.length - a.length)[0];
assert.ok(control.length >= 26 && control.length <= captured.documents.length, 'Use every independently captured original document');
for (const doc of control) {
  const actual = byName.get(doc.name); assert.ok(actual);
  assert.equal(hash(actual.fields), hash(doc.fields || {}));
  assert.equal(normalize({timestampValue: doc.updateTime}).timestampValue, actual.updateTime);
  assert.equal(normalize({timestampValue: doc.createTime}).timestampValue, actual.createTime);
}
async function request(resource, options = {}) {
  const response = await fetch(base + resource, {...options, headers: {Authorization: 'Bearer owner', 'Content-Type': 'application/json'}, signal: AbortSignal.timeout(15000)});
  assert.ok(response.ok, `Separate local QA HTTP ${response.status}`);
  return response.json();
}
const verifyOnly = cold || process.argv.includes('--verify-only');
if (!verifyOnly) {
const empty = await request(':listCollectionIds', {method: 'POST', body: JSON.stringify({pageSize: 50})});
assert.equal(empty.collectionIds?.length || 0, 0, 'Never overwrite a nonempty datastore');
for (let offset = 0; offset < captured.documents.length; offset += 50) {
  const writes = captured.documents.slice(offset, offset + 50).map(item => ({update: {name: item.document.name, fields: item.document.fields}}));
  assert.ok(writes.every(item => item.update.name.startsWith(prefix)));
  await request(':commit', {method: 'POST', body: JSON.stringify({writes})});
}
}
let verified = 0;
for (let offset = 0; offset < captured.documents.length; offset += 50) {
  const docs = captured.documents.slice(offset, offset + 50).map(item => item.document);
  const response = await request(':batchGet', {method: 'POST', body: JSON.stringify({documents: docs.map(doc => doc.name)})});
  const read = new Map(response.filter(item => item.found).map(item => [item.found.name, item.found]));
  for (const doc of docs) {assert.equal(hash(read.get(doc.name)?.fields), hash(doc.fields)); verified++;}
}
for (const name of captured.deletedNames) {
  const response = await fetch(`http://127.0.0.1:${port}/v1/` + name.split('/').map(encodeURIComponent).join('/'), {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)});
  assert.equal(response.status, 404, 'Do not resurrect deleted rows');
}
const result = {status: 'PASS', datastoreAnchoredLiveDocuments: captured.documents.length, excludedDeletedRows: captured.deletedNames.length, sourceHttpControlFieldsAndMetadata: control.length, freshBatchFieldReadbacks: verified, deletedRowsRemainAbsent: true, encodedDeletedIdDidNotAliasExistingDocument: true, oldFullHttpParityNotClaimed: true, restoredFirestoreCreateUpdateMetadataNotOriginal: true, originalDatabaseWritten: false, originalServicesStopped: false, target: `Separate local demo Firestore${port}`, coldNativeImport: cold, rawIdentityDataPrivate: true, rulesChanged: false, productionRequests: false};
await fs.writeFile(`output/original-rpc-diagnostic/${cold ? 'cold-native' : 'independent-import'}-results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
