import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const root = 'tmp/original-rpc-diagnostic/heap-63964-20261014';
const captured = JSON.parse(await fs.readFile(`${root}/live-database.json`, 'utf8'));
const out = 'output/original-rpc-diagnostic';
const restored = process.argv.includes('--restored');
const prefix = 'projects/demo-boq-v041/databases/(default)/documents/';
const normalize = v => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? 'nullValue' in v ? {nullValue: 'NULL_VALUE'} : 'arrayValue' in v ? {arrayValue: {values: normalize(v.arrayValue.values || [])}} : 'mapValue' in v ? {mapValue: {fields: normalize(v.mapValue.fields || {})}} : 'timestampValue' in v ? {timestampValue: v.timestampValue.replace(/(?:\.(\d+))?Z$/, (_, n) => '.' + (n || '').padEnd(9, '0') + 'Z')} : Object.fromEntries(Object.keys(v).sort().map(k => [k, normalize(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(normalize(v))).digest('hex');
let verified = 0, retries = 0, absent = 0;
async function document(name) {
  assert.ok(name.startsWith(prefix));
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:8751/v1/' + name.split('/').map(encodeURIComponent).join('/'), {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)});
      if (response.status === 404) return null;
      assert.equal(response.status, 200, 'Original local owner read');
      return await response.json();
    } catch (error) {last = error; if (attempt < 2) retries++;}
  }
  throw last;
}
for (const item of captured.documents) {
  const actual = await document(item.document.name);
  assert.ok(actual, 'Captured live document must exist on original server');
  assert.equal(hash(actual.fields || {}), hash(item.document.fields), 'Heap-anchored and actual owner field values must agree');
  if (!restored) {
    assert.equal(normalize({timestampValue: actual.updateTime}).timestampValue, item.document.updateTime);
    assert.equal(normalize({timestampValue: actual.createTime}).timestampValue, item.document.createTime);
  }
  verified++;
  if (verified % 50 === 0) console.log(`Matched ${verified} ${restored ? 'restored primary document fields' : 'original documents including create/update metadata'}`);
}
for (const name of captured.deletedNames) {assert.equal(await document(name), null, 'Latest deleted row must remain absent'); absent++;}
assert.equal(verified + absent, 599);
const result = {status: 'PASS', preservedFieldReadbacksOnPrimary: verified, originalCreateUpdateMetadataReadbacks: restored ? 0 : verified, originalFirestoreMetadataRestored: !restored, latestDeletedRowsStillAbsent: absent, completeUniqueDatastoreAnchorRows: 599, retries, verificationPerformedNoWrites: true, rawDataPrivate: true, primaryRestoredFromVerifiedFieldCheckpoint: restored, productionRequests: false};
await fs.writeFile(`${out}/${restored ? 'restored-primary' : 'original-parity'}-results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
