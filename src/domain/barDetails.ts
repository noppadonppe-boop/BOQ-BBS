import {Bar,Member,Vec3} from './model';
import {barPaths,roundedPath} from './engine';
import {arcGeometry,arcNormal} from './arcGeometry';
import {helixGeometry,helixPoint} from './helixGeometry';
export const DRAWING_LAYOUT='details-v2' as const;
const sub=(a:Vec3,b:Vec3)=>a.map((v,i)=>v-b[i]) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a:Vec3)=>Math.hypot(...a);
const unit=(a:Vec3)=>a.map(v=>v/norm(a)) as Vec3;
const code=(prefix:string,n:number)=>prefix+String(n).padStart(2,'0');
export function barDetail(member:Member,bar:Bar){
 if(bar.shape==='helix'){
  const helix=helixGeometry(bar),path=barPaths(member,bar)[0]||[],frame=bar.helix,mid=path.length&&frame?helixPoint(frame,bar.radius,frame.turns/2).map((n,i)=>n+path[0][i]-helix.points[0][i]) as Vec3:undefined,points=mid?[path[0],mid,path.at(-1)!]:[],bends=frame&&!helix.errors.length?[{label:'H01',point:1,angle:frame.turns*360,arc:helix.length,trim:0,normal:frame.axis}]:[];
  return {points,path,legs:[] as {label:string;from:number;to:number;virtualLength:number;straightLength:number;trimStart:number;trimEnd:number}[],bends,references:Object.entries(bar.dimensions||{}).map(([label,value])=>({label,value})),rawSum:0,straightSum:0,arcSum:helix.length,geometricLength:helix.length,errors:helix.errors,radius:bar.radius,curveFrame:undefined,helixFrame:helix.errors.length?undefined:frame};
 }
 if(bar.shape==='arc'){
  const arc=arcGeometry(bar),path=barPaths(member,bar)[0]||[],angle=(bar.curve?.sweepDegrees||0)*Math.PI/360,mid=path.length&&bar.curve?path[0].map((n,i)=>n+bar.radius*(bar.curve!.u[i]*(Math.cos(angle)-1)+bar.curve!.v[i]*Math.sin(angle))) as Vec3:undefined,points=mid?[path[0],mid,path.at(-1)!]:[];
  const bends=bar.curve&&!arc.errors.length?[{label:'C01',point:1,angle:bar.curve.sweepDegrees,arc:arc.length,trim:0,normal:arcNormal(bar.curve)}]:[];
  return {points,path,legs:[] as {label:string;from:number;to:number;virtualLength:number;straightLength:number;trimStart:number;trimEnd:number}[],bends,references:Object.entries(bar.dimensions||{}).map(([label,value])=>({label,value})),rawSum:0,straightSum:0,arcSum:arc.length,geometricLength:arc.length,errors:arc.errors,radius:bar.radius,curveFrame:arc.errors.length?undefined:bar.curve,helixFrame:undefined};
 }
 const points=barPaths(member,bar)[0]||[],rounded=roundedPath(points,bar.radius),trims=points.map(()=>0);
 const bends:{label:string;point:number;angle:number;arc:number;trim:number;normal:Vec3}[]=[];
 for(let i=1;i<points.length-1;i++){
  const incoming=sub(points[i],points[i-1]),outgoing=sub(points[i+1],points[i]);if(norm(incoming)<.001||norm(outgoing)<.001)continue;
  const a=unit(incoming),b=unit(outgoing),angle=Math.acos(Math.max(-1,Math.min(1,dot(a,b))));if(angle<.00001)continue;
  const n=cross(a,b),trim=bar.radius>0&&angle<Math.PI-.00001?bar.radius*Math.tan(angle/2):0;trims[i]=trim;
  bends.push({label:code('B',bends.length+1),point:i,angle:angle*180/Math.PI,arc:bar.radius*angle,trim,normal:norm(n)>.000001?unit(n):[0,0,0]});
 }
 const legs=points.slice(1).map((p,i)=>({label:code('L',i+1),from:i,to:i+1,virtualLength:norm(sub(p,points[i])),straightLength:norm(sub(p,points[i]))-trims[i]-trims[i+1],trimStart:trims[i],trimEnd:trims[i+1]}));
 const rawSum=legs.reduce((n,l)=>n+l.virtualLength,0),straightSum=legs.reduce((n,l)=>n+l.straightLength,0),arcSum=bends.reduce((n,b)=>n+b.arc,0);
 const references=Object.entries(bar.dimensions||{}).sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>({label,value}));
 return {points,path:rounded.points,legs,bends,references,rawSum,straightSum,arcSum,geometricLength:rounded.length,errors:rounded.errors,radius:bar.radius,curveFrame:undefined,helixFrame:undefined};
}
export type BarDetail=ReturnType<typeof barDetail>;
export function detailParts(detail:BarDetail){
 const count=Math.max(1,Math.ceil(detail.legs.length/6),Math.ceil(detail.bends.length/6),Math.ceil(detail.references.length/6));
 return Array.from({length:count},(_,i)=>({part:i+1,total:count,legs:detail.legs.slice(i*6,i*6+6),bends:detail.bends.slice(i*6,i*6+6),references:detail.references.slice(i*6,i*6+6)}));
}
export type DetailPart=ReturnType<typeof detailParts>[number];
export function shapeSketch(detail:BarDetail,width:number,height:number,part=detailParts(detail)[0]){
 const p=detail.points,origin=p[0]||[0,0,0] as Vec3,first=detail.legs.find(l=>l.virtualLength>.001),u=first?unit(sub(p[first.to],p[first.from])):[1,0,0] as Vec3;
 let normal:Vec3|undefined;for(const at of p){const n=cross(u,sub(at,origin));if(norm(n)>.001){normal=unit(n);break;}}
 const planar=!detail.helixFrame&&(!normal||p.every(at=>Math.abs(dot(sub(at,origin),normal!))<.001));let axisX=u,axisY:Vec3;
 if(planar){axisY=normal?unit(cross(normal,u)):unit(cross(Math.abs(u[2])<.9?[0,0,1]:[0,1,0],u));}
 else{
  const candidates:Vec3[]=[[1,1,1],[1,2,3],[3,2,1],[2,-3,1]];normal=candidates.map(unit).sort((a,b)=>{
   const score=(n:Vec3)=>Math.min(...detail.legs.filter(l=>l.virtualLength>.001).map(l=>1-Math.abs(dot(unit(sub(p[l.to],p[l.from])),n))));return score(b)-score(a);
  })[0];axisX=unit(cross([0,0,1],normal));axisY=unit(cross(normal,axisX));
 }
 if(detail.curveFrame){axisX=detail.curveFrame.u;axisY=detail.curveFrame.v;}
 if(detail.helixFrame){const h=detail.helixFrame,v=unit(cross(h.axis,h.u));axisX=h.u.map((n,i)=>(n-v[i])/Math.sqrt(2)) as Vec3;axisY=h.u.map((n,i)=>(n+v[i]-2*h.axis[i])/Math.sqrt(6)) as Vec3;}
 const project=(at:Vec3):[number,number]=>[dot(sub(at,origin),axisX),-dot(sub(at,origin),axisY)],all=[...p,...detail.path].map(project),lo=[0,1].map(i=>Math.min(0,...all.map(a=>a[i]))),hi=[0,1].map(i=>Math.max(0,...all.map(a=>a[i])));
 const scale=Math.min((width-90)/Math.max(1,hi[0]-lo[0]),(height-50)/Math.max(1,hi[1]-lo[1]));
 const at=(v:Vec3):[number,number]=>{const a=project(v);return [width/2+(a[0]-(lo[0]+hi[0])/2)*scale,height/2+(a[1]-(lo[1]+hi[1])/2)*scale];};
 const labels:{text:string;x:number;y:number;anchor:[number,number];kind:'leg'|'bend'}[]=[];
 function label(text:string,anchor:[number,number],kind:'leg'|'bend'){
  const candidates=[[0,-17],[0,17],[32,-17],[-32,17],[-32,-17],[32,17],[0,-33],[0,33]].map(([x,y])=>({x:Math.max(22,Math.min(width-22,anchor[0]+x)),y:Math.max(10,Math.min(height-10,anchor[1]+y))}));
  const score=(c:{x:number;y:number})=>labels.reduce((s,l)=>s+(Math.abs(c.x-l.x)<39&&Math.abs(c.y-l.y)<15?10000:0),0)+Math.hypot(c.x-anchor[0],c.y-anchor[1]);
  const chosen=candidates.sort((a,b)=>score(a)-score(b))[0];labels.push({text,...chosen,anchor,kind});
 }
 for(const l of part.legs){const a=p[l.from],b=p[l.to];label(l.label,at(a.map((v,i)=>(v+b[i])/2) as Vec3),'leg');}
 for(const b of part.bends)label(b.label,at(p[b.point]),'bend');
 return {path:detail.path.map(at),virtual:p.map(at),labels,planar,point:at};
}
