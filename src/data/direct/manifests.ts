import {getBlob,ref,uploadBytes} from 'firebase/storage';
import {storage} from '../firebase';
import {digestData,sha256} from '../snapshots';
import {canonical} from '../../domain/canonical';
import {SnapshotFile} from '../../domain/model';
import {must} from './common';

// Manifests are content-addressed (path = sha256), so verified bytes can be reused for every
// batch of the same job instead of downloading the file again per 25-member step.
const cache=new Map<string,string>();
const remember=(path:string,text:string)=>{cache.delete(path);cache.set(path,text);while(cache.size>8)cache.delete(cache.keys().next().value!);};
const download=(path:string)=>getBlob(ref(storage,path)).catch((e:any)=>{if(e?.code==='storage/quota-exceeded')throw Error('Firebase Storage เกินโควตาดาวน์โหลด · รอให้โควตารีเซ็ตหรืออัปเกรดแผน แล้วกดทำต่ออีกครั้ง');if(['storage/retry-limit-exceeded','storage/unknown'].includes(e?.code))throw Error(`ดาวน์โหลด Manifest จาก Firebase Storage ไม่ได้ (${e.code}${e?.status_?' / HTTP '+e.status_:''}) · มักเกิดจาก bucket ยังไม่ได้ตั้งค่า CORS ให้เบราว์เซอร์อ่านไฟล์ หรือเครือข่ายขัดข้อง · ตรวจ Console แล้วกดทำต่ออีกครั้ง`);throw e;});
export async function writeManifest(pid:string,folder:string,data:unknown,maxBytes=40*1024*1024):Promise<SnapshotFile>{
 const hash=await digestData(data),text=canonical(data),blob=new Blob([text],{type:'application/json'}),path=`projects/${pid}/${folder}/${hash}.json`;
 must(blob.size<=maxBytes,'แบ่งงาน: Manifest เกินขนาดที่รองรับ');
 if(cache.get(path)!==text)try{const old=await download(path);must(old.size===blob.size&&await sha256(await old.arrayBuffer())===hash,'Manifest ที่มีอยู่ checksum ไม่ตรง');}catch(e:any){if(e.code!=='storage/object-not-found')throw e;await uploadBytes(ref(storage,path),blob,{contentType:'application/json',customMetadata:{sha256:hash}});}
 remember(path,text);
 return {path,name:`${hash}.json`,size:blob.size,contentType:'application/json',sha256:hash};
}
export async function readManifest<T>(pid:string,file:SnapshotFile,maxBytes=40*1024*1024):Promise<T>{
 must(file.path.startsWith(`projects/${pid}/`)&&file.size<=maxBytes,'Manifest ไม่ตรงโครงการหรือใหญ่เกินกำหนด');
 let text=file.path.endsWith(`/${file.sha256}.json`)?cache.get(file.path):undefined;
 if(text===undefined||new TextEncoder().encode(text).length!==file.size){const blob=await download(file.path);must(blob.size===file.size&&await sha256(await blob.arrayBuffer())===file.sha256,'Manifest checksum ไม่ตรง');text=await blob.text();}
 remember(file.path,text);return JSON.parse(text) as T;
}
export function chunk<T>(entries:T[],start:number,bytes:(e:T)=>number){let end=start,total=0;while(end<entries.length&&end-start<25){const size=bytes(entries[end]);must(size<4*1024*1024,'ข้อมูลหนึ่งรายการเกินขนาดชุด 4 MiB');if(total+size>=4*1024*1024&&end>start)break;total+=size;end++;}return entries.slice(start,end);}
