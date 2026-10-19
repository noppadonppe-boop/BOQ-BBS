import {sourceAnnotationSchema,type Attachment,type Member} from './model';
import {sourceCurrent} from './sourceRevisions';
export type SourceMarkTarget={memberId:string;barId:string;mark:string;attachmentId:string;version:number;sha256:string;path:string;page:number;index:number;x:number;y:number};
export function sourceMarkTargets(m:Member,barId:string,files:Attachment[]):SourceMarkTarget[]{
 const b=m.bars.find(b=>b.id===barId);if(!b)return [];
 return files.filter(a=>a.memberId===m.id&&sourceCurrent(a)&&!!a.sha256&&/^[a-f0-9]{64}$/.test(a.sha256)&&!!a.pageCount&&['application/pdf','image/png','image/jpeg'].includes(a.contentType)).flatMap(a=>(a.annotations||[]).flatMap((p,index)=>{if(p.mark!==b.mark||!sourceAnnotationSchema.safeParse(p).success||p.page>a.pageCount!||a.contentType!=='application/pdf'&&p.page!==1)return [];return [{memberId:m.id,barId:b.id,mark:b.mark,attachmentId:a.id,version:a.version||1,sha256:a.sha256!,path:a.path,page:p.page,index,x:p.x,y:p.y}];})).sort((a,b)=>a.attachmentId.localeCompare(b.attachmentId)||a.page-b.page||a.index-b.index);
}
export function currentSourceMarkTarget(t:SourceMarkTarget|undefined,m:Pick<Member,'id'|'bars'>,files:Attachment[]){
 if(!t||m.id!==t.memberId||!m.bars.some(b=>b.id===t.barId&&b.mark===t.mark))return undefined;
 const a=files.find(a=>a.id===t.attachmentId),p=a?.annotations?.[t.index];
 if(!a||!['application/pdf','image/png','image/jpeg'].includes(a.contentType)||a.contentType!=='application/pdf'&&t.page!==1||!a.sha256||!/^[a-f0-9]{64}$/.test(a.sha256)||!sourceCurrent(a)||a.memberId!==m.id||(a.version||1)!==t.version||a.sha256!==t.sha256||a.path!==t.path||!a.pageCount||t.page>a.pageCount||!p||!sourceAnnotationSchema.safeParse(p).success||p.mark!==t.mark||p.page!==t.page||p.x!==t.x||p.y!==t.y)return undefined;
 return {attachment:a,point:p};
}
