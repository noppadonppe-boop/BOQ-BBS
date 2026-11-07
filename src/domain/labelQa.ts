// Label QA (Mark leaders on the BBS sheet): checks the drawn sheet primitives, never changes them.
// Rules (sheet mm): label boxes must not overlap and keep `minGap`, not sit on other text (dimensions, levels …) or on
// bar / concrete / dimension lines, leaders must not cross, labels stay inside their view box, leaders ≤ `maxLeader`;
// leaders must not cross an opening outline / cross or an opening diagonal bar (prims with `qa: 'opening'`, wall sheets);
// a view may ask a larger gap than `minGap` (`views[].minGap`, wall sheets 1.5 mm).
import {expandPrims,textWidth,type LeaderPrim,type PlainPrim,type Prim} from './drawingPrims';

export type LabelRules={enabled:boolean;minGap:number;maxLeader:number;lines:boolean};
export const defaultLabelRules:LabelRules={enabled:true,minGap:1,maxLeader:75,lines:true};
export type LabelIssueKind='overlap'|'onText'|'cross'|'outside'|'tight'|'onLine'|'long'|'opening';
/** high = a reader can misread the Mark; low = workmanship (crowded, on a line, long leader) */
export const labelIssueInfo:Record<LabelIssueKind,{label:string;high:boolean}>={
 overlap:{label:'ป้ายทับกัน',high:true},onText:{label:'ทับข้อความ / ตัวเลข',high:true},cross:{label:'เส้นชี้ไขว้กัน',high:true},outside:{label:'ล้นกรอบรูป',high:true},
 tight:{label:'ป้ายชิดกันเกิน',high:false},onLine:{label:'ทับเส้นเหล็ก / คอนกรีต',high:false},long:{label:'เส้นชี้ยาวเกิน',high:false},
 opening:{label:'เส้นชี้ตัดช่องเปิด / เหล็กทแยง',high:false}};
export const labelIssueKinds=Object.keys(labelIssueInfo) as LabelIssueKind[];
type Box={x:number;y:number;w:number;h:number};
export type LabelIssue={kind:LabelIssueKind;view?:string;marks:string[];detail?:string;
 /** sheet mm area to highlight */ box:Box};
export type ViewLabelReport={view:string;title:string;leaders:number;issues:LabelIssue[];count:Partial<Record<LabelIssueKind,number>>;high:number;low:number};

type B={x0:number;x1:number;y0:number;y1:number};
const toBox=(b:B):Box=>({x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0});
const union=(...bs:B[]):B=>({x0:Math.min(...bs.map(b=>b.x0)),x1:Math.max(...bs.map(b=>b.x1)),y0:Math.min(...bs.map(b=>b.y0)),y1:Math.max(...bs.map(b=>b.y1))});
/** text box (baseline y, cap height ≈ 0.8 size, descent 0.2 size) */
export function textBox(x:number,y:number,text:string,size:number,anchor?:'start'|'middle'|'end'):B{
 const w=textWidth(text,size),x0=anchor==='middle'?x-w/2:anchor==='end'?x-w:x;return {x0,x1:x0+w,y0:y-size*.8,y1:y+size*.2};}
const hit=(a:B,b:B,g=0)=>a.x0<b.x1+g&&b.x0<a.x1+g&&a.y0<b.y1+g&&b.y0<a.y1+g;
/** segment touches the box (Liang–Barsky) */
function segHits(x1:number,y1:number,x2:number,y2:number,b:B){
 let t0=0,t1=1;const dx=x2-x1,dy=y2-y1;
 for(const [p,q] of [[-dx,x1-b.x0],[dx,b.x1-x1],[-dy,y1-b.y0],[dy,b.y1-y1]]){if(p===0){if(q<0)return false;continue;}const r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}}
 return true;}
type P=[number,number];
/** proper crossing point of two segments (touching ends do not count) */
function crossAt(a:P,b:P,c:P,d:P):P|undefined{
 const o=(p:P,q:P,r:P)=>Math.sign((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]));
 if(!(o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0))return;
 const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]),t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den;return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];}
const segsOf=(p:PlainPrim):[number,number,number,number][]=>{
 if(p.t==='line')return [[p.x1,p.y1,p.x2,p.y2]];
 if(p.t==='rect')return [[p.x,p.y,p.x+p.w,p.y],[p.x+p.w,p.y,p.x+p.w,p.y+p.h],[p.x+p.w,p.y+p.h,p.x,p.y+p.h],[p.x,p.y+p.h,p.x,p.y]];
 if(p.t==='poly'){const s:[number,number,number,number][]=[];for(let i=1;i<p.pts.length;i++)s.push([p.pts[i-1][0],p.pts[i-1][1],p.pts[i][0],p.pts[i][1]]);if(p.closed&&p.pts.length>2)s.push([p.pts.at(-1)![0],p.pts.at(-1)![1],p.pts[0][0],p.pts[0][1]]);return s;}
 return [];};
const name=(l:LeaderPrim)=>l.mark?.mark||l.text[0]||'?';

/** Every label issue of one sheet (prims as drawn by `drawSheetInfo`, views = its view boxes). */
export function labelIssues(prims:Prim[],views:{id:string;box:Box;minGap?:number}[],rules:LabelRules=defaultLabelRules):LabelIssue[]{
 if(!rules.enabled)return [];
 const L=prims.filter((p):p is LeaderPrim=>p.t==='leader'),out:LabelIssue[]=[];if(!L.length)return out;
 const lb=L.map(l=>{const lines=l.text.length,b=textBox(l.at[0],l.at[1],l.text[0],l.size,l.anchor);
  return lines>1?union(b,...l.text.slice(1).map((t,i)=>textBox(l.at[0],l.at[1]+(i+1)*l.size*1.2,t,l.size,l.anchor))):b;});
 const plain=expandPrims(prims.filter(p=>p.t!=='leader')).filter(p=>p.view&&p.layer!=='titleBlock');
 const texts=plain.flatMap(p=>p.t==='text'?[{b:textBox(p.x,p.y,p.text,p.size,p.anchor),text:p.text,view:p.view}]:[]);
 const opening=plain.filter(p=>p.qa==='opening').flatMap(p=>segsOf(p).map(s=>({s,view:p.view})));
 const lines=rules.lines?plain.filter(p=>p.layer==='barMain'||p.layer==='barLink'||p.layer==='concrete'||p.layer==='dim').flatMap(p=>segsOf(p).map(s=>({s,view:p.view,layer:p.layer}))):[];
 for(let i=0;i<L.length;i++){const a=L[i],ba=lb[i],view=a.view,gap=Math.max(rules.minGap,views.find(x=>x.id===view)?.minGap||0);
  for(let j=i+1;j<L.length;j++){const b=L[j];if(b.view!==view)continue;const bb=lb[j];
   if(hit(ba,bb))out.push({kind:'overlap',view,marks:[name(a),name(b)],box:toBox(union(ba,bb))});
   else if(hit(ba,bb,Math.max(gap,views.find(x=>x.id===b.view)?.minGap||0)))out.push({kind:'tight',view,marks:[name(a),name(b)],box:toBox(union(ba,bb))});
   let c:P|undefined;for(let p=0;p<a.pts.length-1&&!c;p++)for(let q=0;q<b.pts.length-1&&!c;q++)c=crossAt(a.pts[p],a.pts[p+1],b.pts[q],b.pts[q+1]);
   if(c)out.push({kind:'cross',view,marks:[name(a),name(b)],box:{x:c[0]-2,y:c[1]-2,w:4,h:4}});}
  const t=texts.find(o=>o.view===view&&hit(ba,o.b));if(t)out.push({kind:'onText',view,marks:[name(a)],detail:t.text,box:toBox(union(ba,t.b))});
  const ln=lines.find(o=>o.view===view&&segHits(o.s[0],o.s[1],o.s[2],o.s[3],ba));
  if(ln)out.push({kind:'onLine',view,marks:[name(a)],detail:ln.layer==='dim'?'เส้น Dimension':ln.layer==='concrete'?'ขอบคอนกรีต':'เส้นเหล็ก',box:toBox(ba)});
  let oc:P|undefined;for(let p=0;p<a.pts.length-1&&!oc;p++)for(const o of opening){if(o.view!==view)continue;oc=crossAt(a.pts[p],a.pts[p+1],[o.s[0],o.s[1]],[o.s[2],o.s[3]]);if(oc)break;}
  if(oc)out.push({kind:'opening',view,marks:[name(a)],box:{x:oc[0]-2,y:oc[1]-2,w:4,h:4}});
  const v=views.find(x=>x.id===view);
  if(v&&(ba.x0<v.box.x-.01||ba.x1>v.box.x+v.box.w+.01||ba.y0<v.box.y-.01||ba.y1>v.box.y+v.box.h+.01))out.push({kind:'outside',view,marks:[name(a)],box:toBox(ba)});
  const len=a.pts.slice(1).reduce((s,p,k)=>s+Math.hypot(p[0]-a.pts[k][0],p[1]-a.pts[k][1]),0);
  if(len>rules.maxLeader)out.push({kind:'long',view,marks:[name(a)],detail:`${Math.round(len)} mm`,box:toBox(union(ba,{x0:a.pts[0][0],x1:a.pts[0][0],y0:a.pts[0][1],y1:a.pts[0][1]}))});}
 return out;
}
/** Issues grouped per view (views without leaders are left out). */
export function labelReport(prims:Prim[],views:{id:string;title:string;box:Box;minGap?:number}[],rules:LabelRules=defaultLabelRules):ViewLabelReport[]{
 const issues=labelIssues(prims,views,rules),n=new Map<string,number>();
 for(const p of prims)if(p.t==='leader'&&p.view)n.set(p.view,(n.get(p.view)||0)+1);
 return views.filter(v=>n.get(v.id)).map(v=>{const list=issues.filter(i=>i.view===v.id),count:ViewLabelReport['count']={};for(const i of list)count[i.kind]=(count[i.kind]||0)+1;
  return {view:v.id,title:v.title,leaders:n.get(v.id)!,issues:list,count,high:list.filter(i=>labelIssueInfo[i.kind].high).length,low:list.filter(i=>!labelIssueInfo[i.kind].high).length};});
}
/** "เส้นชี้ไขว้กัน 26 · ทับเส้น 34" (high first) */
export const labelCountText=(count:Partial<Record<LabelIssueKind,number>>)=>labelIssueKinds.filter(k=>count[k]).sort((a,b)=>Number(labelIssueInfo[b].high)-Number(labelIssueInfo[a].high)).map(k=>`${labelIssueInfo[k].label} ${count[k]}`).join(' · ');
export function totalCount(reports:ViewLabelReport[]){const c:Partial<Record<LabelIssueKind,number>>={};for(const r of reports)for(const [k,v] of Object.entries(r.count))c[k as LabelIssueKind]=(c[k as LabelIssueKind]||0)+v!;return c;}
