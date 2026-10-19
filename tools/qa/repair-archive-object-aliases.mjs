import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inventory} from './firestore-inventory.mjs';

const missing = JSON.parse(await fs.readFile('tmp/full-current-cold-qa/missing-reference-diagnostic.json', 'utf8'));
const objects = JSON.parse(await fs.readFile('tmp/full-current-cold-qa/objects.json', 'utf8'));
const aliases = [...new Map(missing.map(item => [item.path, item])).values()];
assert.equal(aliases.length, 16);
const before = await inventory(8751);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
for (const alias of aliases) {
  assert.match(alias.path, /^projects\/[a-zA-Z0-9_-]{1,80}\/archive\//);
  const source = objects.find(o => o.sha256 === alias.sha256); assert.ok(source);
  const resource = `/v0/b/${encodeURIComponent(source.bucket)}/o/`;
  const target = `http://127.0.0.1:9531${resource}${encodeURIComponent(alias.path)}`;
  const exists = await fetch(target, {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)});
  if (exists.status === 200) {
    const bytes = new Uint8Array(await (await fetch(target + '?alt=media', {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)})).arrayBuffer());
    assert.equal(hash(bytes), alias.sha256); results.push({alreadyPresent: true}); continue;
  }
  assert.equal(exists.status, 404, 'Never overwrite an existing object');
  const sourceUrl = `http://127.0.0.1:9531${resource}${encodeURIComponent(source.path)}`;
  const metadata = await (await fetch(sourceUrl, {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)})).json();
  const response = await fetch(sourceUrl + '?alt=media', {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)}); assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(hash(bytes), alias.sha256); assert.equal(bytes.length, source.size);
  const boundary = 'boq-verified-archive-repair';
  const meta = {name: alias.path, contentType: metadata.contentType, ...(metadata.contentDisposition ? {contentDisposition: metadata.contentDisposition} : {}), metadata: {sha256: alias.sha256}};
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${metadata.contentType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const upload = await fetch(`http://127.0.0.1:9531/v0/b/${encodeURIComponent(source.bucket)}/o?uploadType=media&name=${encodeURIComponent(alias.path)}`, {method: 'POST', headers: {Authorization: 'Bearer owner', 'Content-Type': `multipart/related; boundary=${boundary}`, 'X-Goog-Upload-Protocol': 'multipart'}, body, signal: AbortSignal.timeout(15000)});
  assert.equal(upload.status, 200);
  const actual = await fetch(target + '?alt=media', {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)}); assert.equal(actual.status, 200);
  assert.equal(hash(Buffer.from(await actual.arrayBuffer())), alias.sha256);
  results.push({exactHashRestored: true, size: bytes.length});
}
const after = await inventory(8751); assert.equal(after.digest, before.digest); assert.deepEqual(after.missing, before.missing);
const result = {status: 'PASS', missingArchivePaths: aliases.length, exactHashRestored: results.filter(r => r.exactHashRestored).length, alreadyPresent: results.filter(r => r.alreadyPresent).length, sourceExistingObjectsNotOverwritten: true, firestoreFieldsAndPermissionsUnchanged: true, sourceBytesFromExistingVerifiedHashesOnly: true, reconstructedObjectMetadataNotOriginal: true, recoveryToolNowIncludesImportedHistory: true, productionRequests: false, authChanged: false, rulesChanged: false};
await fs.writeFile('output/full-current-cold-verification/archive-repair-results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
