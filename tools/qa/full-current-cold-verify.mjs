import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inventory} from './firestore-inventory.mjs';

const out = 'output/full-current-cold-verification';
await fs.mkdir(out, {recursive: true});
const context = JSON.parse(await fs.readFile('tmp/full-current-cold-qa/capture-context.json', 'utf8'));
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const hash = value => createHash('sha256').update(value).digest('hex');
const before = await inventory(8751), after = await inventory(8971);
assert.equal(after.digest, before.digest);
assert.deepEqual(after.missing, before.missing);
await fs.writeFile('tmp/full-current-cold-qa/primary-inventory.json', JSON.stringify(before));
await fs.writeFile('tmp/full-current-cold-qa/imported-inventory.json', JSON.stringify(after));
console.log(`PASS ${before.records.length} document fields and ${before.missing.length} missing parents`);

const capturedAuth = JSON.parse(await fs.readFile(path.join(context.target, 'auth_export/accounts.json'), 'utf8'));
const response = await fetch('http://127.0.0.1:11521/identitytoolkit.googleapis.com/v1/projects/demo-boq-v041/accounts:batchGet?maxResults=1000', {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(10000)});
assert.equal(response.status, 200);
const auth = await response.json();
assert.ok(!auth.nextPageToken && !capturedAuth.nextPageToken);
assert.equal(auth.users.length, 11); assert.equal(auth.users.length, capturedAuth.users.length);
let tokenEpochResets = 0, passwordTimestampResets = 0;
for (const user of capturedAuth.users) {
  const imported = auth.users.find(u => u.localId === user.localId); assert.ok(imported);
  for (const key of ['localId', 'email', 'passwordHash', 'salt', 'customAttributes', 'providerUserInfo', 'phoneNumber', 'mfaInfo', 'tenantId', 'createdAt']) assert.deepEqual(imported[key], user[key], key);
  for (const key of ['disabled', 'emailVerified']) assert.equal(imported[key] || false, user[key] || false, key);
  // The installed native importer deliberately resets these epochs for passwordHash.
  // Verify the stricter/newer epochs rather than claiming exact session restoration.
  assert.ok(Number(imported.validSince) >= Number(user.validSince || 0));
  assert.ok(Number(imported.passwordUpdatedAt) >= Number(user.passwordUpdatedAt || 0));
  assert.ok(Math.abs(Number(imported.passwordUpdatedAt) - Number(imported.validSince) * 1000) < 1000);
  if (imported.validSince !== user.validSince) tokenEpochResets++;
  if (imported.passwordUpdatedAt !== user.passwordUpdatedAt) passwordTimestampResets++;
}
assert.equal(tokenEpochResets, 11); assert.equal(passwordTimestampResets, 11);
console.log('PASS 11 account identities/credentials/providers/claims; import token/password epochs reset explicitly');

async function metadataFiles(dir) {
  const files = [];
  for (const item of await fs.readdir(dir, {withFileTypes: true})) {
    const name = path.join(dir, item.name);
    if (item.isDirectory()) files.push(...await metadataFiles(name));
    else if (name.endsWith('.json')) {
      const value = JSON.parse(await fs.readFile(name, 'utf8'));
      if (typeof value.name === 'string' && typeof value.bucket === 'string') files.push(value);
    }
  }
  return files;
}
const objects = await metadataFiles(path.join(context.target, 'storage_export'));
const capturedState = JSON.parse(await fs.readFile(`${out}/current-capture-results.json`, 'utf8'));
assert.equal(capturedState.status, 'PASS');
assert.equal(objects.length, 91); assert.equal(objects.length, capturedState.storageBlobs);
const observed = [];
for (let offset = 0; offset < objects.length; offset += 3) {
  const batch = await Promise.all(objects.slice(offset, offset + 3).map(async object => {
    const resource = `/v0/b/${encodeURIComponent(object.bucket)}/o/${encodeURIComponent(object.name)}`;
    const read = async port => {
      const meta = await fetch(`http://127.0.0.1:${port}${resource}`, {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(15000)});
      assert.equal(meta.status, 200); const body = await meta.json();
      const media = await fetch(`http://127.0.0.1:${port}${resource}?alt=media`, {headers: {Authorization: 'Bearer owner'}, signal: AbortSignal.timeout(15000)});
      assert.equal(media.status, 200); const bytes = new Uint8Array(await media.arrayBuffer());
      return {metadataDigest: hash(JSON.stringify(stable(body))), sha256: hash(bytes), size: bytes.length};
    };
    const primary = await read(9531), imported = await read(9534);
    assert.deepEqual(imported, primary, 'Full object bytes and metadata must match the current primary');
    assert.equal(imported.size, Number(object.size));
    return {...imported, path: object.name, bucket: object.bucket};
  }));
  observed.push(...batch);
}
await fs.writeFile('tmp/full-current-cold-qa/objects.json', JSON.stringify(observed));
const current = await inventory(8751);
assert.equal(current.digest, before.digest, 'Primary business fields changed during read-only comparison');
assert.deepEqual(current.missing, before.missing);
const result = {status: 'PASS', firestoreDocumentFields: before.records.length, missingParentPaths: before.missing.length, fullPaginatedFieldDigestMatches: true, authAccounts: auth.users.length, identitiesCredentialsProvidersClaimsAndCreatedAtExact: true, disabledAndVerifiedSecurityFlagsEqual: true, tokenEpochResets, passwordTimestampResets, originalSessionContinuityNotClaimed: true, loginTimestampExcluded: true, storageObjects: observed.length, allObjectBytesAndCurrentMetadataExact: true, includesObjectTimestampsGenerationsCustomMetadataAndTokens: true, primaryFieldsUnchangedDuringVerification: true, restoredOriginalPreRepairFirestoreHeadersNotClaimed: true, preIncidentLostAccountsMetadataNotRecovered: true, rawIdentityAndMetadataValuesPrivate: true, productionRequests: false, deployments: false};
await fs.writeFile(`${out}/full-service-results.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
