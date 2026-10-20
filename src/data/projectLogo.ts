import {getBlob,ref,uploadBytes} from 'firebase/storage';
import {storage} from './firebase';
import {sha256} from './snapshots';
import type {Project,ProjectLogo} from '../domain/model';

export const LOGO_MAX_BYTES=2*1024*1024;
/** Uploads a PNG/JPEG company logo under the project's branding folder (immutable new object). */
export async function uploadProjectLogo(projectId:string,file:File):Promise<ProjectLogo>{
 if(!['image/png','image/jpeg'].includes(file.type))throw Error('โลโก้ต้องเป็นไฟล์ PNG หรือ JPEG');
 if(file.size>LOGO_MAX_BYTES)throw Error('โลโก้ต้องมีขนาดไม่เกิน 2 MB');
 const bytes=await file.arrayBuffer(),hash=await sha256(bytes),ext=file.type==='image/png'?'png':'jpg',path=`projects/${projectId}/branding/logo-${hash.slice(0,16)}-${Date.now()}.${ext}`;
 await uploadBytes(ref(storage,path),bytes,{contentType:file.type,customMetadata:{sha256:hash,kind:'project-logo'}});
 return {path,name:file.name.slice(0,250),contentType:file.type as ProjectLogo['contentType'],size:file.size,sha256:hash};
}
export type LoadedLogo={src:string;width:number;height:number};
const cache=new Map<string,Promise<LoadedLogo|undefined>>();
/** Loads the logo as a data URL with its pixel size (for SVG preview and jsPDF). Checksum verified. */
export function loadProjectLogo(project:Pick<Project,'logo'>):Promise<LoadedLogo|undefined>{
 const logo=project.logo;if(!logo)return Promise.resolve(undefined);
 if(!cache.has(logo.path))cache.set(logo.path,(async()=>{
  const blob=await getBlob(ref(storage,logo.path)),bytes=await blob.arrayBuffer();
  if(await sha256(bytes)!==logo.sha256)throw Error('ไฟล์โลโก้ checksum ไม่ตรง');
  const src=await new Promise<string>((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error);r.readAsDataURL(new Blob([bytes],{type:logo.contentType}));});
  const size=await new Promise<{width:number;height:number}>((ok,bad)=>{const img=new Image();img.onload=()=>ok({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>bad(Error('อ่านไฟล์โลโก้ไม่ได้'));img.src=src;});
  return {src,...size};
 })().catch(e=>{cache.delete(logo.path);throw e;}));
 return cache.get(logo.path)!;
}
/** Reads a local file for preview before upload. */
export function previewLogoFile(file:File):Promise<string>{return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>bad(r.error);r.readAsDataURL(file);});}
