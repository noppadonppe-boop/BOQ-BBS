import {getBlob,ref} from 'firebase/storage';
import {SnapshotBundle,SnapshotRecord} from '../domain/model';
import {canonical} from '../domain/canonical';
import {storage} from './firebase';

export const sha256=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
export const digestData=(v:unknown)=>sha256(new TextEncoder().encode(canonical(v)).buffer);
export async function loadSnapshot(record:SnapshotRecord):Promise<SnapshotBundle>{
 let bundle=record.bundle;
 if(record.snapshot){
  const f=record.snapshot;if(f.sha256!==record.digest||f.size>20*1024*1024)throw Error('Snapshot reference ไม่ถูกต้อง');
  // Request the complete object. Mixing ranged and full reads of the same
  // immutable URL can reuse a cached 206 response during a later backup.
  const blob=await getBlob(ref(storage,f.path));
  if(blob.size!==f.size||await sha256(await blob.arrayBuffer())!==record.digest)throw Error('Snapshot checksum ไม่ตรง');
  bundle=JSON.parse(await blob.text()) as SnapshotBundle;
 }
 if(!bundle||await digestData(bundle)!==record.digest)throw Error('Snapshot checksum ไม่ตรง');
 return bundle;
}
