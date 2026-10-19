import {sha256,digestData} from './snapshots';
import {canonical} from '../domain/canonical';
import type {SnapshotBundle,Attachment} from '../domain/model';
import {validateBackupStructure,type BackupHistoryRecord,type BackupHistoryArtifact} from '../domain/restorePreflight';
import {inspectAttachmentDocument} from './documentInspection';
import {buildRestorePlan} from '../domain/restorePlan';
export type TransferProgress=(message:string)=>void;
export type BackupInspection=ReturnType<typeof validateBackupStructure>&{fileName:string;zipBytes:number;zipSha256:string;verifiedBytes:number;files:{name:string;kind:string;revision:string;pages:number;size:number}[]};
type Prepared={bundle:SnapshotBundle;digest:string;fileHashes:Record<string,string>;historyRecords:BackupHistoryRecord[];checked:{a:Attachment;blob:Blob;pages:number}[];checkedHistory:{f:BackupHistoryArtifact;blob:Blob}[];summary:BackupInspection};
// Immutable File identity binds the preview to the bytes later restored. A
// cancelled/closed view releases its File and the weak preparation cache.
const preparations=new WeakMap<File,Promise<Prepared>>();
function freezeJson(value:any){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);Object.values(value).forEach(freezeJson);}return value;}
async function prepare(file:File,progress:TransferProgress):Promise<Prepared>{
 progress('ตรวจสอบ Backup โดยยังไม่อัปโหลดไฟล์…');
 const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(file),entry=zip.file('manifest.json');if(!entry)throw Error('ไม่พบ manifest.json');
 const manifestText=await entry.async('string');if(new TextEncoder().encode(manifestText).length>20*1024*1024)throw Error('แบ่ง Backup: manifest เกิน20MB');
 const {digest,files,fileHashes,history,...bundle}=JSON.parse(manifestText) as SnapshotBundle&{digest:string;files:Record<string,string>;fileHashes:Record<string,string>;history?:{entry:string;sha256:string}};
 if(![1,2].includes(bundle.schemaVersion))throw Error('Backup schema ไม่รองรับ');
 if(await sha256(new TextEncoder().encode(bundle.schemaVersion===1?JSON.stringify(bundle):canonical(bundle)).buffer)!==digest)throw Error('Backup checksum ไม่ตรง');
 let historyRecords:BackupHistoryRecord[]=[],artifacts:BackupHistoryArtifact[]=[];const expected=new Set(['manifest.json']);
 if(history){if(typeof history.entry!=='string'||typeof history.sha256!=='string')throw Error('ข้อมูลประวัติ Backup ไม่ถูกต้อง');const h=zip.file(history.entry);if(!h)throw Error('ไม่พบประวัติใน Backup');expected.add(history.entry);const text=await h.async('string');if(new TextEncoder().encode(text).length>20*1024*1024)throw Error('แบ่ง Backup: history เกิน20MB');if(await sha256(new TextEncoder().encode(text).buffer)!==history.sha256)throw Error('ประวัติ Backup checksum ไม่ตรง');const data=JSON.parse(text);historyRecords=data.records;artifacts=data.artifacts;}
 const summary=validateBackupStructure(bundle,historyRecords,artifacts);
 if(!files||typeof files!=='object'||!fileHashes||typeof fileHashes!=='object')throw Error('ดัชนีไฟล์ Backup ไม่ถูกต้อง');
 const indexed=new Map(historyRecords.map(r=>[r.collection+'/'+r.id,r]));for(const i of bundle.historyIndex||[]){const r=indexed.get(i.collection+'/'+i.id);if(!r||await digestData(r.data)!==i.digest)throw Error('ข้อมูลประวัติ Backup checksum ไม่ตรง');}
 const checked:Prepared['checked']=[],checkedHistory:Prepared['checkedHistory']=[];let verifiedBytes=0;
 for(const a of bundle.attachments){const key=files[a.id];if(typeof key!=='string'||expected.has(key)||!fileHashes[a.id])throw Error('ดัชนีไฟล์ Backup ซ้ำหรือไม่ครบ');expected.add(key);const e=zip.file(key);if(!e)throw Error(`Backup ไม่มีไฟล์ ${a.name}`);const bytes=await e.async('uint8array'),blob=new Blob([bytes as BlobPart],{type:a.contentType}),hash=await sha256(await blob.arrayBuffer());if(blob.size!==a.size||hash!==fileHashes[a.id]||a.sha256&&hash!==a.sha256)throw Error(`ไฟล์ ${a.name} checksum ไม่ตรง`);const pages=await inspectAttachmentDocument(a,blob);verifiedBytes+=blob.size;checked.push({a,blob,pages});progress(`ตรวจแบบต้นทาง ${checked.length}/${bundle.attachments.length}`);}
 for(const f of artifacts){if(expected.has(f.key))throw Error('ดัชนีไฟล์ประวัติซ้ำ');expected.add(f.key);const e=zip.file(f.key);if(!e)throw Error(`ไม่มีไฟล์ประวัติ ${f.name}`);const bytes=await e.async('uint8array'),blob=new Blob([bytes as BlobPart],{type:f.contentType});if(blob.size!==f.size||await sha256(await blob.arrayBuffer())!==f.sha256)throw Error('ไฟล์ประวัติ Backup checksum ไม่ตรง');verifiedBytes+=blob.size;checkedHistory.push({f,blob});progress(`ตรวจไฟล์ประวัติ ${checkedHistory.length}/${artifacts.length}`);}
 if(Object.values(zip.files).some(e=>!e.dir&&!expected.has(e.name)))throw Error('Backup มีไฟล์นอกดัชนีที่ตรวจสอบ');
 buildRestorePlan(bundle,checked.map(({a,pages})=>({...a,pageCount:pages,sha256:fileHashes[a.id]})),historyRecords,artifacts.map(f=>({...f,originalPath:f.originalPath||f.path})),'00000000-0000-0000-0000-000000000000',new Date().toISOString());
 const inspection:BackupInspection={...summary,fileName:file.name,zipBytes:file.size,zipSha256:await sha256(await file.arrayBuffer()),verifiedBytes,files:checked.map(({a,pages})=>({name:a.name,kind:a.kind,revision:a.revision,pages,size:a.size}))};
 freezeJson(bundle);freezeJson(fileHashes);freezeJson(historyRecords);freezeJson(inspection);
 for(const row of [...checked,...checkedHistory]){Object.freeze(row.blob);Object.freeze(row);}Object.freeze(checked);Object.freeze(checkedHistory);
 progress('ตรวจ Backup ผ่าน · ยังไม่เริ่มกู้คืน');return Object.freeze({bundle,digest,fileHashes,historyRecords,checked,checkedHistory,summary:inspection});
}
export function prepareBackup(file:File,progress:TransferProgress=()=>{}){let promise=preparations.get(file);if(!promise){promise=prepare(file,progress);preparations.set(file,promise);promise.catch(()=>preparations.delete(file));}return promise;}
export async function inspectBackup(file:File,progress:TransferProgress=()=>{}){return structuredClone((await prepareBackup(file,progress)).summary);}
