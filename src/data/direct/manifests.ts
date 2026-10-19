import {getBlob,ref,uploadBytes} from 'firebase/storage';
import {storage} from '../firebase';
import {digestData,sha256} from '../snapshots';
import {canonical} from '../../domain/canonical';
import {SnapshotFile} from '../../domain/model';
import {must} from './common';

export async function writeManifest(pid:string,folder:string,data:unknown,maxBytes=40*1024*1024):Promise<SnapshotFile>{
 const hash=await digestData(data),blob=new Blob([canonical(data)],{type:'application/json'}),path=`projects/${pid}/${folder}/${hash}.json`;
 must(blob.size<=maxBytes,'แบ่งงาน: Manifest เกินขนาดที่รองรับ');
 try{const old=await getBlob(ref(storage,path));must(old.size===blob.size&&await sha256(await old.arrayBuffer())===hash,'Manifest ที่มีอยู่ checksum ไม่ตรง');}catch(e:any){if(e.code!=='storage/object-not-found')throw e;await uploadBytes(ref(storage,path),blob,{contentType:'application/json',customMetadata:{sha256:hash}});}
 return {path,name:`${hash}.json`,size:blob.size,contentType:'application/json',sha256:hash};
}
export async function readManifest<T>(pid:string,file:SnapshotFile,maxBytes=40*1024*1024):Promise<T>{
 must(file.path.startsWith(`projects/${pid}/`)&&file.size<=maxBytes,'Manifest ไม่ตรงโครงการหรือใหญ่เกินกำหนด');const blob=await getBlob(ref(storage,file.path));must(blob.size===file.size&&await sha256(await blob.arrayBuffer())===file.sha256,'Manifest checksum ไม่ตรง');return JSON.parse(await blob.text()) as T;
}
export function chunk<T>(entries:T[],start:number,bytes:(e:T)=>number){let end=start,total=0;while(end<entries.length&&end-start<25){const size=bytes(entries[end]);must(size<4*1024*1024,'ข้อมูลหนึ่งรายการเกินขนาดชุด 4 MiB');if(total+size>=4*1024*1024&&end>start)break;total+=size;end++;}return entries.slice(start,end);}
