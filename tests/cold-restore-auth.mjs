import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const c=JSON.parse(await fs.readFile('tmp/cold-restore-qa/capture-context.json','utf8'));
const captured=JSON.parse(await fs.readFile(c.target+'/auth_export/accounts.json','utf8'));
const r=await fetch('http://127.0.0.1:11321/identitytoolkit.googleapis.com/v1/projects/demo-boq-v041/accounts:batchGet?maxResults=1000',{headers:{Authorization:'Bearer owner'},signal:AbortSignal.timeout(10000)});
assert.equal(r.ok,true);const imported=await r.json();assert.equal(imported.users.length,captured.users.length);
const normalizedDefaults=[];
for(const before of captured.users){
 const after=imported.users.find(u=>u.localId===before.localId);assert.ok(after);
 for(const key of ['localId','email','passwordHash','salt','customAttributes','providerUserInfo'])assert.deepEqual(after[key],before[key],key);
 for(const key of ['disabled','emailVerified']){
  assert.equal(after[key]||false,before[key]||false,key);
  if(after[key]!==before[key])normalizedDefaults.push({field:key,before:before[key]===undefined?'absent':before[key],after:after[key]===undefined?'absent':after[key]});
 }
}
await fs.writeFile('output/cold-restore-verification/auth-results.json',JSON.stringify({status:'PASS',accountCount:captured.users.length,identityCredentialsProviderClaimsExact:true,securityBooleansSemanticallyEqual:true,normalizedDefaults,lastLoginTimestampExcluded:true,rawPasswordsHashesNotPublished:true,productionRequests:false},null,2));
console.log('PASS captured Auth identity/credentials/providers/claims; explicit false security defaults normalized; login times excluded');
