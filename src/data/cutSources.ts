import {getBlob,ref} from 'firebase/storage';
import {storage} from './firebase';
import {sha256} from './snapshots';
import {must} from './direct/common';
export async function verifyCutSourceBytes(sources:{path:string;size:number;sha256:string}[]){let bytes=0;for(const s of sources){bytes+=s.size;must(bytes<=120*1024*1024,'แบ่งแผนตัด: แบบต้นทางรวมเกิน120MiB');const b=await getBlob(ref(storage,s.path));must(b.size===s.size&&await sha256(await b.arrayBuffer())===s.sha256,'ไฟล์ต้นทางแผนตัด checksum เปลี่ยนแล้ว รับแบบและจัดแผนใหม่');}}
