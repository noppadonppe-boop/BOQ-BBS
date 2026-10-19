import {createHash} from 'node:crypto';
export async function inventory(port){
 if(![8751,8851,8971].includes(port))throw Error('Only the known local QA databases');
 const base=`http://127.0.0.1:${port}/v1/projects/demo-boq-v041/databases/(default)/documents`;
 async function request(resource,options={}){const r=await fetch(base+resource,{...options,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Local inventory HTTP '+r.status);return r.json();}
 const encodedParent=parent=>parent.split('/').map(encodeURIComponent).join('/');
 async function collections(parent){const result=[];let token='';do{const body=await request(encodedParent(parent)+':listCollectionIds',{method:'POST',body:JSON.stringify({pageSize:100,...(token?{pageToken:token}:{})})});result.push(...(body.collectionIds||[]));token=body.nextPageToken||'';}while(token);return result.sort();}
 const queue=[''],records=[],missing=[];
 for(let i=0;i<queue.length;i++){
  const parent=queue[i];
  for(const name of await collections(parent)){
   let token='';do{
    const body=await request(encodedParent(parent)+'/'+encodeURIComponent(name)+'?pageSize=100&showMissing=true'+(token?'&pageToken='+encodeURIComponent(token):''));
    for(const doc of body.documents||[]){const relative='/'+doc.name.split('/documents/')[1];queue.push(relative);if(doc.fields||doc.createTime)records.push({path:relative,fields:doc.fields||{}});else missing.push(relative);if(queue.length>20000)throw Error('Inventory exceeds local QA limit');}
    token=body.nextPageToken||'';
   }while(token);
  }
 }
 records.sort((a,b)=>a.path.localeCompare(b.path));
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 const digest=createHash('sha256').update(JSON.stringify(canonical(records))).digest('hex');
 return {records,missing:missing.sort(),digest};
}
