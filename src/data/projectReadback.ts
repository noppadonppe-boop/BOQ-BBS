import {auth,db,emulator} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import {must} from './direct/common';
import {userDocPath} from '../domain/auth';
// Firebase ID tokens retain Security Rules authorization. Only GET requests;
// this is a separate acknowledgement channel, never an admin credential.
export function decodeDocumentValue(v:any):any{
 if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decodeDocumentValue(x)]));
 if(v.arrayValue)return (v.arrayValue.values||[]).map(decodeDocumentValue);
 if('nullValue'in v)return null;if('integerValue'in v){const n=Number(v.integerValue);must(Number.isSafeInteger(n),'ค่าจำนวนในฐานข้อมูลเกินขอบเขต');return n;}
 for(const key of ['stringValue','booleanValue','doubleValue','timestampValue','referenceValue','bytesValue'])if(key in v)return v[key];
 throw Error('ชนิดข้อมูลตอบกลับจาก Firebase ไม่รองรับ');
}
async function documentRequest(path:string,params:Record<string,string>={}){
 const user=auth.currentUser;must(user&&!user.isAnonymous,'กรุณาเข้าสู่ระบบ','unauthenticated');const uid=user.uid,token=await user.getIdToken();must(auth.currentUser?.uid===uid,'บัญชีเปลี่ยนแล้ว','aborted');const project=db.app.options.projectId;must(project,'ไม่ได้ตั้งค่า Firebase');
 const base=emulator?`http://127.0.0.1:${Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT||8080)}`:'https://firestore.googleapis.com',encodedPath=path.split('/').map(encodeURIComponent).join('/'),query=Object.entries(params).map(([key,value])=>encodeURIComponent(key)+'='+encodeURIComponent(value)).join('&');const response=await fetch(`${base}/v1/projects/${encodeURIComponent(project)}/databases/(default)/documents/${encodedPath}${query?'?'+query:''}`,{method:'GET',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),cache:'no-store'});
 must(auth.currentUser?.uid===uid,'บัญชีเปลี่ยนแล้ว','aborted');if(response.status===404)return undefined;must(response.status!==429,'Firebase แจ้งเกินโควตา/จำกัดอัตรา (429) · รอให้โควตารีเซ็ตแล้วลองอีกครั้ง','resource-exhausted');must(response.ok,'ตรวจสถานะ Firebase ไม่สำเร็จ',response.status===401?'unauthenticated':response.status===403?'permission-denied':'unavailable');const body=await response.json();must(auth.currentUser?.uid===uid,'บัญชีเปลี่ยนแล้ว','aborted');return {body,project};
}
export async function readProjectRecord(pid:string,collection?:string,id?:string):Promise<any>{
 for(const value of [pid,...(collection?[collection,id!]:[])])must(/^[a-zA-Z0-9_-]{1,80}$/.test(value),'รหัสข้อมูลไม่ถูกต้อง','invalid-argument');
 const path=`projects/${pid}${collection?'/'+collection+'/'+id:''}`,result=await documentRequest(path);if(!result)return undefined;const {body,project}=result;must(body.name===`projects/${project}/databases/(default)/documents/${path}`,'ข้อมูลตอบกลับไม่ตรงโครงการ');return decodeStorage(decodeDocumentValue({mapValue:{fields:body.fields}}));
}
export async function readProjectPage(pid:string,name:string,token?:string){
 for(const value of [pid,name])must(/^[a-zA-Z0-9_-]{1,80}$/.test(value),'รหัสข้อมูลไม่ถูกต้อง','invalid-argument');const path=`projects/${pid}/${name}`,result=await documentRequest(path,{pageSize:'50',orderBy:'__name__ ASC',...(token?{pageToken:token}:{})});must(result,'ไม่พบชุดข้อมูล','not-found');const {body,project}=result,prefix=`projects/${project}/databases/(default)/documents/${path}/`;
 const records=(body.documents||[]).map((d:any)=>{must(typeof d.name==='string'&&d.name.startsWith(prefix)&&/^[a-zA-Z0-9_-]{1,80}$/.test(d.name.slice(prefix.length)),'รายการตอบกลับไม่ตรงโครงการ');return decodeStorage(decodeDocumentValue({mapValue:{fields:d.fields}}));});return {records,next:body.nextPageToken as string|undefined};
}
export async function readProjectDirectoryPage(token?:string){
 const result=await documentRequest('projects',{pageSize:'50',orderBy:'__name__ ASC',...(token?{pageToken:token}:{})});must(result,'ไม่พบทะเบียนโครงการ');const prefix=`projects/${result.project}/databases/(default)/documents/projects/`;return {records:(result.body.documents||[]).map((d:any)=>{must(d.name?.startsWith(prefix)&&/^[a-zA-Z0-9_-]{1,80}$/.test(d.name.slice(prefix.length)),'โครงการตอบกลับไม่ตรงฐานข้อมูล');return decodeStorage(decodeDocumentValue({mapValue:{fields:d.fields}}));}) as any[],next:result.body.nextPageToken as string|undefined};
}
export async function readOwnProfileRecord(){const user=auth.currentUser;must(user?.email&&!user.isAnonymous,'กรุณาเข้าสู่ระบบ','unauthenticated');const uid=user.uid,path=userDocPath(user.email),result=await documentRequest(path);must(result,'ไม่พบโปรไฟล์');must(auth.currentUser?.uid===uid&&result.body.name===`projects/${result.project}/databases/(default)/documents/${path}`,'บัญชีตอบกลับไม่ตรง');const profile=decodeDocumentValue({mapValue:{fields:result.body.fields}});must(profile.uid===uid,'บัญชีตอบกลับไม่ตรง','permission-denied');return profile;}
