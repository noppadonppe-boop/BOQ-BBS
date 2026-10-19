import JSZip from 'jszip';
import {auth,db,storage,emulator} from '../src/data/firebase';
import {getBlob,getMetadata,ref,uploadBytes} from 'firebase/storage';
import {sha256} from '../src/data/snapshots';
export async function recoverReviewStorage(file:File){
 if(!emulator||db.app.options.projectId!=='demo-boq-v041'||!auth.currentUser)throw Error('Local QA recovery only');
 const z=await JSZip.loadAsync(file),m=JSON.parse(await z.file('manifest.json')!.async('string')),history=JSON.parse(await z.file(m.history.entry)!.async('string'));
 const entries=[...m.attachments.map((a:any)=>({path:a.path,key:m.files[a.id],sha256:a.sha256,contentType:a.contentType})),...history.artifacts];let restored=0,preserved=0;
 for(const e of entries){if(!e.path.startsWith('projects/'+m.project.id+'/'))throw Error('Recovery path escaped original QA project');const data=await z.file(e.key)!.async('uint8array');if(await sha256(data.buffer as ArrayBuffer)!==e.sha256)throw Error('Backup artifact checksum differs');const r=ref(storage,e.path);try{const current=await getBlob(r);if(await sha256(await current.arrayBuffer())!==e.sha256)throw Error('Existing bytes differ; no overwrite');preserved++;}catch(error:any){if(error.code!=='storage/object-not-found')throw error;await uploadBytes(r,data,{contentType:e.contentType,customMetadata:{sha256:e.sha256}});restored++;}if((await getMetadata(r)).size!==data.length)throw Error('Recovered size differs');}
 return {projectId:m.project.id,restored,preserved,firestoreChanged:false};
}
