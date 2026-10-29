import {useMemo,useState} from 'react';
import type {Member,Vec3} from '../domain/model';
import {barPaths} from '../domain/engine';

type Rect={x0:number;y0:number;x1:number;y1:number};
/** Light plan / section sketch of a member (concrete parts + every bar), used by the IFC import review. */
export function MemberSketch({member:m}:{member:Member}){
 const [view,setView]=useState<'plan'|'x'|'y'>(m.category==='Beam'?'x':m.category==='Column'?'y':'plan');
 const axes:[number,number]=view==='plan'?[0,1]:view==='x'?[0,2]:[1,2];
 const {parts,poly,lines,box}=useMemo(()=>{
  const boxes:[Vec3,Vec3][]=[],polys:[number,number][][]=[];
  if(m.shapeModel)for(const p of m.shapeModel.parts){if(p.role!=='solid')continue;const z0=p.z0,z1=p.z0+p.height;
   if(p.shape==='polygon'){polys.push(p.points);const xs=p.points.map(q=>q[0]),ys=p.points.map(q=>q[1]);boxes.push([[Math.min(...xs),Math.min(...ys),z0],[Math.max(...xs),Math.max(...ys),z1]]);}
   else if(p.shape==='circle')boxes.push([[p.cx-p.diameter/2,p.cy-p.diameter/2,z0],[p.cx+p.diameter/2,p.cy+p.diameter/2,z1]]);
   else boxes.push([[p.x,p.y,z0],[p.x+p.w,p.y+p.d,z1]]);}
  else if(m.geometry)for(const s of m.geometry.solids)boxes.push([s.origin,[s.origin[0]+s.size[0],s.origin[1]+s.size[1],s.origin[2]+s.size[2]]]);
  else boxes.push([[0,0,0],[m.x,m.y,m.z]]);
  const piles=(m.shapeModel?.piles?.positions||[]).map(p=>{const r=(m.shapeModel!.piles!.size||300)/2;return [[p[0]-r,p[1]-r,-600],[p[0]+r,p[1]+r,0]] as [Vec3,Vec3];});
  const lines:{pts:Vec3[];d:number}[]=[];let n=0;
  for(const b of m.bars){for(const path of barPaths(m,b)){if(n++>4000)break;lines.push({pts:path,d:b.diameter});}}
  const all=[...boxes.flatMap(b=>b),...lines.flatMap(l=>l.pts)];
  const lo=[0,1,2].map(k=>Math.min(...all.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...all.map(p=>p[k])));
  return {parts:[...boxes.map(b=>({b,pile:false})),...piles.map(b=>({b,pile:true}))],poly:polys,lines,box:{lo,hi}};
 },[m]);
 const [u,v]=axes,pad=Math.max(box.hi[u]-box.lo[u],box.hi[v]-box.lo[v])*.06+50;
 const W=box.hi[u]-box.lo[u]+2*pad,H=box.hi[v]-box.lo[v]+2*pad,X=(p:number)=>p-box.lo[u]+pad,Y=(p:number)=>box.hi[v]-p+pad;
 const r=(a:Vec3,b:Vec3):Rect=>({x0:X(a[u]),x1:X(b[u]),y0:Y(b[v]),y1:Y(a[v])}),sw=Math.max(W,H)/400;
 return <figure className="ifc-sketch">
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${view==='plan'?'แปลน':view==='x'?'รูปด้าน X':'รูปด้าน Y'} ${m.code}`}>
   {parts.map(({b,pile},i)=>{const q=r(b[0],b[1]);return view==='plan'&&!pile&&poly.length&&i===0?null:<rect key={i} x={q.x0} y={q.y0} width={q.x1-q.x0} height={q.y1-q.y0} fill={pile?'#e5e7eb':'#eef2f6'} stroke="#64748b" strokeWidth={sw} strokeDasharray={pile?`${sw*4} ${sw*3}`:undefined}/>;})}
   {view==='plan'&&poly.map((p,i)=><polygon key={i} points={p.map(q=>`${X(q[0])},${Y(q[1])}`).join(' ')} fill="#eef2f6" stroke="#64748b" strokeWidth={sw}/>)}
   {lines.map((l,i)=><polyline key={i} points={l.pts.map(p=>`${X(p[u])},${Y(p[v])}`).join(' ')} fill="none" stroke="#c0392b" strokeWidth={Math.max(sw*.8,l.d*.6)} strokeLinejoin="round" opacity={.75}/>)}
  </svg>
  <figcaption><div className="segmented">{(['plan','x','y'] as const).map(k=><button key={k} className={view===k?'active':''} onClick={()=>setView(k)}>{k==='plan'?'แปลน':k==='x'?'ด้าน X':'ด้าน Y'}</button>)}</div></figcaption>
 </figure>;
}
