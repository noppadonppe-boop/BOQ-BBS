import {getDocFromServer} from 'firebase/firestore';
import {auth} from './firebase';
import {readCollectionPages} from './collections';
import {decodeStorage} from '../domain/storageCodec';
import {calculationEngine} from '../domain/version';
import {inventoryScopeSchema,type InventoryScope} from '../domain/inventoryReport';
import type {Project,SnapshotBundle} from '../domain/model';
import {actor,allow,writable,projectRef,must,now} from './direct/common';

export async function readInventoryInput(pid:string,scope:InventoryScope={},active=()=>true):Promise<SnapshotBundle>{
 const filter=inventoryScopeSchema.parse(scope),u=await actor(),before=await getDocFromServer(projectRef(pid));must(before.exists(),'ไม่พบโครงการ');const p=decodeStorage(before.data()) as Project;allow(p,u,['admin','qs','checker','approver','viewer']);writable(p);
 const [stock,stockLedger,cutPlans]=await Promise.all(['stock','stockLedger','cutPlans'].map(n=>readCollectionPages(pid,n,()=>{},active)));
 must(active()&&auth.currentUser?.uid===u.uid,'ผู้ใช้หรือหน้าตรวจสต็อกเปลี่ยนแล้ว','aborted');const after=await getDocFromServer(projectRef(pid));must(after.exists(),'ไม่พบโครงการ');must(active()&&auth.currentUser?.uid===u.uid,'ผู้ใช้หรือหน้าตรวจสต็อกเปลี่ยนแล้ว','aborted');const current=decodeStorage(after.data()) as Project;allow(current,u,['admin','qs','checker','approver','viewer']);writable(current);must(current.version===p.version&&(current.stockEpoch||'')===(p.stockEpoch||''),'สต็อกเปลี่ยนระหว่างอ่าน ให้โหลดข้อมูลใหม่','aborted');
 return {schemaVersion:2,project:p,members:[],attachments:[],stock,stockLedger,cutPlans,createdAt:now(),status:'Draft',version:p.version,engineVersion:calculationEngine(p.spec),inventory:{version:1,scope:filter}};
}
