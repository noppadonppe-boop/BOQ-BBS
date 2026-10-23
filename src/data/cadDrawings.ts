import polygonClipping,{type MultiPolygon,type Polygon} from 'polygon-clipping';

// CAD / BIM sources for the AI shape reader. Both readers return a master canvas of the drawing
// (tiled like a PDF page) or ready views, plus an exact text summary (coordinates, dimensions, levels)
// that is sent with the images so the AI does not have to read numbers off pixels.
export type CadDrawing={canvas?:HTMLCanvasElement;views?:{label:string;data:string}[];text:string;focus?:{title:string;box:number[]}};
const MASTER=4800,MAX_TEXT=60000;
const r1=(v:number)=>Math.round(v*10)/10;
// loops, not Math.min(...list): real drawings have more points than the engine's argument limit
const minOf=(list:Iterable<number>)=>{let m=Infinity;for(const v of list)if(v<m)m=v;return m;};
const maxOf=(list:Iterable<number>)=>{let m=-Infinity;for(const v of list)if(v>m)m=v;return m;};

// ---------------------------------------------------------------- DXF
type Seg=[number,number,number,number];type Txt={x:number;y:number;h:number;rot:number;text:string;top:boolean};
type Xf={tx:number;ty:number;sx:number;sy:number;rot:number};
const ID:Xf={tx:0,ty:0,sx:1,sy:1,rot:0};
const apply=(t:Xf,x:number,y:number):[number,number]=>{const c=Math.cos(t.rot),s=Math.sin(t.rot),u=x*t.sx,v=y*t.sy;return [t.tx+u*c-v*s,t.ty+u*s+v*c];};
const compose=(outer:Xf,inner:Xf):Xf=>{const [tx,ty]=apply(outer,inner.tx,inner.ty);return {tx,ty,sx:outer.sx*inner.sx,sy:outer.sy*inner.sy,rot:outer.rot+inner.rot};};
const cleanMText=(t:string)=>t.replace(/\\P/g,' ').replace(/\\[A-Za-z][^;\\{}]*;/g,'').replace(/\\[A-Za-z]/g,'').replace(/[{}]/g,'').replace(/%%[uUoO]/g,'').replace(/%%[cC]/g,'Ø').replace(/%%[dD]/g,'°').replace(/%%[pP]/g,'±').replace(/\s+/g,' ').trim();
const UNITS:Record<number,string>={0:'ไม่ระบุ',1:'inch',2:'feet',4:'mm',5:'cm',6:'m'};

/** `focus`: member codes / file name to frame (a sheet often holds many details); `frame`: explicit window in drawing units. */
export async function dxfDrawing(blob:Blob,opts:{focus?:string[];frame?:[number,number,number,number]}={}):Promise<CadDrawing>{
 const {default:DxfParser}=await import('dxf-parser');
 const dxf:any=new DxfParser().parseSync(await blob.text());
 if(!dxf)throw Error('อ่านไฟล์ DXF ไม่ได้');
 const segs:Seg[]=[],texts:Txt[]=[],dims:{x:number;y:number;value:string}[]=[],inserts:{name:string;box:[number,number,number,number]}[]=[];
 const arc=(t:Xf,cx:number,cy:number,r:number,a0:number,a1:number)=>{let sweep=a1-a0;if(sweep<=0)sweep+=2*Math.PI;const n=Math.max(8,Math.ceil(sweep/(Math.PI/24)));let prev=apply(t,cx+r*Math.cos(a0),cy+r*Math.sin(a0));for(let i=1;i<=n;i++){const a=a0+sweep*i/n,p=apply(t,cx+r*Math.cos(a),cy+r*Math.sin(a));segs.push([prev[0],prev[1],p[0],p[1]]);prev=p;}};
 const walk=(entities:any[],t:Xf,depth:number)=>{
  for(const e of entities||[]){
   switch(e.type){
    case 'LINE':{const [a,b]=e.vertices||[];if(a&&b){const p=apply(t,a.x,a.y),q=apply(t,b.x,b.y);segs.push([p[0],p[1],q[0],q[1]]);}break;}
    case 'LWPOLYLINE':case 'POLYLINE':{const v=(e.vertices||[]).map((p:any)=>apply(t,p.x,p.y));for(let i=1;i<v.length;i++)segs.push([v[i-1][0],v[i-1][1],v[i][0],v[i][1]]);if((e.shape||e.closed)&&v.length>2)segs.push([v.at(-1)[0],v.at(-1)[1],v[0][0],v[0][1]]);break;}
    case 'CIRCLE':arc(t,e.center.x,e.center.y,e.radius,0,2*Math.PI);break;
    case 'ARC':arc(t,e.center.x,e.center.y,e.radius,e.startAngle,e.endAngle);break;
    case 'SPLINE':{const pts=(e.fitPoints?.length?e.fitPoints:e.controlPoints)||[];const v=pts.map((p:any)=>apply(t,p.x,p.y));for(let i=1;i<v.length;i++)segs.push([v[i-1][0],v[i-1][1],v[i][0],v[i][1]]);break;}
    case 'SOLID':case '3DFACE':{const v=(e.points||e.vertices||[]).map((p:any)=>apply(t,p.x,p.y));for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];segs.push([a[0],a[1],b[0],b[1]]);}break;}
    case 'TEXT':case 'MTEXT':case 'ATTRIB':{const p=e.startPoint||e.position;const text=cleanMText(String(e.text||''));if(p&&text){const [x,y]=apply(t,p.x,p.y);texts.push({x,y,h:Math.abs((e.textHeight||e.height||2.5)*t.sy),rot:t.rot+((e.rotation||0)*Math.PI/180),text,top:depth===0});}break;}
    case 'DIMENSION':{
     const block=e.block&&dxf.blocks?.[e.block];if(block&&depth<8)walk(block.entities,t,depth+1);
     const at=e.middleOfText||e.anchorPoint,raw=String(e.text||'').trim(),measured=Number(e.actualMeasurement);
     const value=raw&&raw!=='<>'?cleanMText(raw.replace('<>',Number.isFinite(measured)?String(r1(measured)):'')):Number.isFinite(measured)?String(r1(measured)):'';
     if(at&&value){const [x,y]=apply(t,at.x,at.y);dims.push({x,y,value});}break;}
    case 'INSERT':{
     const block=dxf.blocks?.[e.name];if(!block||depth>=8)break;
     const base=block.position||{x:0,y:0},inner:Xf={tx:e.position.x,ty:e.position.y,sx:e.xScale??1,sy:e.yScale??1,rot:(e.rotation||0)*Math.PI/180};
     const from=segs.length;walk(block.entities,compose(compose(t,inner),{tx:-base.x,ty:-base.y,sx:1,sy:1,rot:0}),depth+1);
     // top-level block extents: drawing sheets / title-block frames are usually one INSERT
     if(depth===0&&segs.length>from){let b:[number,number,number,number]=[Infinity,-Infinity,Infinity,-Infinity];for(let i=from;i<segs.length;i++){const q=segs[i];b=[Math.min(b[0],q[0],q[2]),Math.max(b[1],q[0],q[2]),Math.min(b[2],q[1],q[3]),Math.max(b[3],q[1],q[3])];}inserts.push({name:e.name,box:b});}
     break;}
   }
  }
 };
 // model space only when the file also has paper-space (layout) entities
 const top=(dxf.entities||[]) as any[],model=top.filter(e=>!e.inPaperSpace);
 walk(model.length?model:top,ID,0);
 if(!segs.length&&!texts.length)throw Error('ไฟล์ DXF ไม่มีเส้นหรือข้อความใน Model space');
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 const grow=(x:number,y:number)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;};
 for(const s of segs){grow(s[0],s[1]);grow(s[2],s[3]);}for(const t of texts)grow(t.x,t.y);
 const full=[minX,maxX,minY,maxY];
 const focus=opts.frame?{box:opts.frame,title:''}:opts.focus?.length?focusDetail(segs,texts,inserts,opts.focus):undefined;
 // stray objects far from the drawing would shrink it to a dot: frame the 0.2–99.8 % range of the geometry instead
 if(focus){[minX,maxX,minY,maxY]=focus.box;}
 else if(segs.length>50){const px=segs.map(s=>(s[0]+s[2])/2).sort((a,b)=>a-b),py=segs.map(s=>(s[1]+s[3])/2).sort((a,b)=>a-b),q=(a:number[],f:number)=>a[Math.min(a.length-1,Math.floor(a.length*f))];
  const x0=q(px,.002),x1=q(px,.998),y0=q(py,.002),y1=q(py,.998),mx=(x1-x0)*.05,my=(y1-y0)*.05;
  if((maxX-minX)>3*(x1-x0)||(maxY-minY)>3*(y1-y0)){minX=Math.max(minX,x0-mx);maxX=Math.min(maxX,x1+mx);minY=Math.max(minY,y0-my);maxY=Math.min(maxY,y1+my);}}
 const W=maxX-minX||1,H=maxY-minY||1,k=MASTER/Math.max(W,H),pad=40;
 const c=document.createElement('canvas');c.width=Math.ceil(W*k)+2*pad;c.height=Math.ceil(H*k)+2*pad;
 const ctx=c.getContext('2d')!,X=(x:number)=>pad+(x-minX)*k,Y=(y:number)=>pad+(maxY-y)*k;
 ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='#000';ctx.lineWidth=1.2;ctx.beginPath();
 for(const s of segs){ctx.moveTo(X(s[0]),Y(s[1]));ctx.lineTo(X(s[2]),Y(s[3]));}ctx.stroke();
 ctx.fillStyle='#000';ctx.textBaseline='alphabetic';
 for(const t of texts){const px=Math.max(7,t.h*k);ctx.save();ctx.translate(X(t.x),Y(t.y));ctx.rotate(-t.rot);ctx.font=`${px}px sans-serif`;ctx.fillText(t.text,0,0);ctx.restore();}
 const code=dxf.header?.$INSUNITS,units=code===undefined?'ไม่ระบุในไฟล์ (ตรวจจากค่ามิติ)':UNITS[Number(code)]??`รหัส ${code}`;
 const inside=(x:number,y:number)=>!focus||x>=minX&&x<=maxX&&y>=minY&&y<=maxY,ds=dims.filter(d=>inside(d.x,d.y)),ts=texts.filter(t=>inside(t.x,t.y));
 const lines=[...(focus&&'sheet' in focus&&focus.sheet?[`แผ่นงานในไฟล์มีหลายแบบ · องค์ประกอบนี้คือแบบ "${focus.title}" (ชื่อใต้แปลนของมัน) · ใช้แปลน "${focus.title}" และรูปตัดที่แปลนนั้นอ้างถึง (เครื่องหมายตัด / ชื่อ SECTION) เท่านั้น ห้ามรวมแบบอื่นในแผ่น`]:[]),`ข้อมูลจากไฟล์ DXF (พิกัดตามไฟล์ · หน่วยวาด ${units} · X ขวา Y ขึ้น · ขอบเขตไฟล์ X ${r1(full[0])}..${r1(full[1])} Y ${r1(full[2])}..${r1(full[3])})`,
  ...(focus?[`ภาพและรายการด้านล่างเฉพาะบริเวณแบบ${focus.title?` "${focus.title}"`:''} X ${r1(minX)}..${r1(maxX)} Y ${r1(minY)}..${r1(maxY)} (แผ่นนี้มีหลายแบบ ใช้เฉพาะบริเวณนี้)`]:[]),
  `มิติ (DIMENSION · ค่าที่วัดจริงในไฟล์) ${ds.length} รายการ:`,...ds.sort((a,b)=>b.y-a.y||a.x-b.x).map(d=>`  ${d.value} @ (${r1(d.x)}, ${r1(d.y)})`),
  `ข้อความ / Note ${ts.length} รายการ:`,...ts.sort((a,b)=>b.y-a.y||a.x-b.x).map(t=>`  "${t.text}" @ (${r1(t.x)}, ${r1(t.y)})`)];
 return {canvas:c,text:lines.join('\n').slice(0,MAX_TEXT),focus:focus?{title:focus.title,box:[minX,maxX,minY,maxY]}:undefined};
}
const norm=(t:string)=>t.toUpperCase().replace(/[\s_]/g,'');
/** Finds the detail titled with one of `codes` (largest matching model-space text) and the drawing around it: geometry cells
 * connected to the area above / around the title, with grid lines and other long lines ignored. */
function focusDetail(segs:Seg[],texts:Txt[],inserts:{name:string;box:[number,number,number,number]}[],codes:string[]):{box:[number,number,number,number];title:string;sheet?:string}|undefined{
 const keys=codes.map(norm).filter(Boolean);
 // title = code, code + non-alphanumeric suffix ("F12-03 (1:50)"), or the code of a member variant (member F12-03-1 → title F12-03)
 const hit=(t:string)=>{const n=norm(t);return n.length>=3&&keys.some(k=>n===k||n.startsWith(k)&&!/[0-9A-Z]/.test(n[k.length]||'')||k.startsWith(n+'-'));};
 const titles=texts.filter(t=>t.top&&hit(t.text)).sort((a,b)=>b.h-a.h);
 const t=titles[0];if(!t)return;
 // 1) the drawing sheet (title-block frame) that contains the title: plan + its sections, like one PDF page
 const sheet=inserts.filter(i=>{const [x0,x1,y0,y1]=i.box,w=x1-x0,h=y1-y0;return t.x>=x0&&t.x<=x1&&t.y>=y0&&t.y<=y1&&Math.min(w,h)>40*t.h&&Math.max(w,h)/Math.min(w,h)<2.2;}).sort((a,b)=>(a.box[1]-a.box[0])*(a.box[3]-a.box[2])-(b.box[1]-b.box[0])*(b.box[3]-b.box[2]))[0];
 if(sheet)return {box:sheet.box,title:t.text,sheet:sheet.name};
 // 2) no frame: geometry connected to the area around the title
 const C=Math.max(250,t.h),key=(i:number,j:number)=>i*1e6+j,cells=new Set<number>(),maxSpan=150*C;
 const mark=(x:number,y:number)=>{if(Math.abs(x-t.x)<maxSpan&&Math.abs(y-t.y)<maxSpan)cells.add(key(Math.floor(x/C),Math.floor(y/C)));};
 for(const s of segs){const L=Math.hypot(s[2]-s[0],s[3]-s[1]);if(L>40*C)continue;const n=Math.min(200,Math.ceil(L/C)+1);for(let i=0;i<=n;i++)mark(s[0]+(s[2]-s[0])*i/n,s[1]+(s[3]-s[1])*i/n);}
 for(const x of texts)mark(x.x,x.y);
 const ti=Math.floor(t.x/C),tj=Math.floor(t.y/C),seen=new Set<number>(),queue:[number,number][]=[];
 for(let i=ti-6;i<=ti+6;i++)for(let j=tj;j<=tj+4;j++)if(cells.has(key(i,j))){seen.add(key(i,j));queue.push([i,j]);}
 let [i0,i1,j0,j1]=[ti,ti,tj,tj];
 while(queue.length){const [i,j]=queue.pop()!;i0=Math.min(i0,i);i1=Math.max(i1,i);j0=Math.min(j0,j);j1=Math.max(j1,j);
  for(let di=-2;di<=2;di++)for(let dj=-2;dj<=2;dj++){const q=key(i+di,j+dj);if(!seen.has(q)&&cells.has(q)){seen.add(q);queue.push([i+di,j+dj]);}}}
 const m=2*C;return {box:[i0*C-m,(i1+1)*C+m,j0*C-m,(j1+1)*C+m],title:t.text};
}

// ---------------------------------------------------------------- IFC
type Tri=[number,number,number][];
type Elem={id:number;type:string;name:string;tris:Tri[];min:[number,number,number];max:[number,number,number];dia?:number};
const CONCRETE=/FOOTING|PILE|SLAB|WALL|COLUMN|BEAM|MEMBER|PLATE|PROXY|STAIR|RAMP|CHIMNEY|ELEMENTASSEMBLY|COVERING/i;

export async function ifcDrawing(blob:Blob):Promise<CadDrawing>{
 const WebIFC=await import('web-ifc'),{default:wasmUrl}=await import('web-ifc/web-ifc.wasm?url');
 const api=new WebIFC.IfcAPI();await api.Init(()=>wasmUrl,true);
 const model=api.OpenModel(new Uint8Array(await blob.arrayBuffer()),{COORDINATE_TO_ORIGIN:true});
 const elems:Elem[]=[];let vertices=0;
 try{
  api.StreamAllMeshes(model,mesh=>{
   const code=api.GetLineType(model,mesh.expressID),type=api.GetNameFromTypeCode(code)||String(code);
   let line:any;try{line=api.GetLine(model,mesh.expressID);}catch{line={};}
   const e:Elem={id:mesh.expressID,type,name:String(line?.Name?.value||line?.Tag?.value||''),tris:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
   if(code===WebIFC.IFCREINFORCINGBAR&&Number.isFinite(Number(line?.NominalDiameter?.value)))e.dia=Number(line.NominalDiameter.value);
   for(let g=0;g<mesh.geometries.size();g++){
    const pg=mesh.geometries.get(g),geo=api.GetGeometry(model,pg.geometryExpressID),m=pg.flatTransformation;
    const v=api.GetVertexArray(geo.GetVertexData(),geo.GetVertexDataSize()),idx=api.GetIndexArray(geo.GetIndexData(),geo.GetIndexDataSize());
    vertices+=v.length/6;if(vertices>3_000_000){geo.delete();throw Error('IFC ใหญ่เกินไป · export เฉพาะองค์ประกอบที่เกี่ยวข้อง (Selected objects / View)');}
    // web-ifc: metres, Y up → member mm, Z up (x, −z, y)
    const P=(i:number):[number,number,number]=>{const x=v[i*6],y=v[i*6+1],z=v[i*6+2];const wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];return [wx*1000,-wz*1000,wy*1000];};
    for(let i=0;i+2<idx.length;i+=3){const t:Tri=[P(idx[i]),P(idx[i+1]),P(idx[i+2])];e.tris.push(t);for(const p of t)for(let a=0;a<3;a++){e.min[a]=Math.min(e.min[a],p[a]);e.max[a]=Math.max(e.max[a],p[a]);}}
    geo.delete();
   }
   if(e.tris.length)elems.push(e);
  });
 }finally{api.CloseModel(model);}
 if(!elems.length)throw Error('ไฟล์ IFC ไม่มีรูปทรง 3D');
 const bars=elems.filter(e=>/REINFORCING/i.test(e.type)),solids=elems.filter(e=>!/REINFORCING/i.test(e.type)&&CONCRETE.test(e.type));
 const ref=(solids.length?solids:elems),o=[0,1,2].map(a=>minOf(ref.map(e=>e.min[a])));
 const L=(p:number[])=>p.map((v,a)=>Math.round(v-o[a]));
 const lines=[`ข้อมูลจากไฟล์ IFC (หน่วย mm · X / Y ในแปลน · Z ขึ้น · จุดอ้างอิง 0,0,0 = มุมต่ำสุดของคอนกรีตทั้งหมด · พิกัดเป็นค่าจริงจากโมเดล ใช้ได้ทันที)`,`องค์ประกอบคอนกรีต ${solids.length} ชิ้น:`];
 for(const e of solids.slice(0,60)){
  lines.push(`- ${e.type}${e.name?` "${e.name}"`:''} · กล่องขอบเขต min ${L(e.min).join(',')} max ${L(e.max).join(',')}`);
  // horizontal faces per level → plan outline at that level (exact for extruded footings / caps / pits)
  const byZ=new Map<number,Polygon[]>();
  for(const t of e.tris){const z=Math.round(t[0][2]);if(t.some(p=>Math.abs(p[2]-t[0][2])>1))continue;const area=(t[1][0]-t[0][0])*(t[2][1]-t[0][1])-(t[2][0]-t[0][0])*(t[1][1]-t[0][1]);if(Math.abs(area)<1)continue;byZ.set(z,[...(byZ.get(z)||[]),[t.map(p=>[p[0],p[1]] as [number,number])]]);}
  for(const [z,polys] of [...byZ.entries()].sort((a,b)=>a[0]-b[0]).slice(0,12)){
   let mp:MultiPolygon=[];try{for(let i=0;i<polys.length;i+=200)mp=polygonClipping.union(mp,...polys.slice(i,i+200));}catch{continue;}
   const rings=mp.map(poly=>simplify(poly[0]).map(p=>`${Math.round(p[0]-o[0])},${Math.round(p[1]-o[1])}`).join(' '));
   lines.push(`    ผิวราบ z ${Math.round(z-o[2])}: ${rings.slice(0,6).map(r=>`[${r}]`).join(' ')}`);
  }
 }
 if(bars.length){
  const groups=new Map<string,{n:number;zMin:number;zMax:number;span:number[]}>();
  for(const b of bars){
   const size=[0,1,2].map(a=>b.max[a]-b.min[a]),axis=size.indexOf(maxOf(size)),dia=b.dia?b.dia*(b.dia<1?1000:1):minOf(size);
   const key=`Ø${Math.round(dia)} · แนว ${'XYZ'[axis]} · ยาว ~${Math.round(size[axis]/10)*10} mm`,g=groups.get(key)||{n:0,zMin:Infinity,zMax:-Infinity,span:[Infinity,-Infinity]};
   g.n++;g.zMin=Math.min(g.zMin,b.min[2]-o[2]);g.zMax=Math.max(g.zMax,b.max[2]-o[2]);const across=axis===0?1:0;g.span=[Math.min(g.span[0],b.min[across]-o[across]),Math.max(g.span[1],b.max[across]-o[across])];groups.set(key,g);
  }
  lines.push(`เหล็กเสริมในโมเดล (IfcReinforcingBar) ${bars.length} เส้น · จัดกลุ่ม:`,...[...groups.entries()].slice(0,150).map(([k,g])=>`- ${k} × ${g.n} เส้น · z ${Math.round(g.zMin)}–${Math.round(g.zMax)} · กระจาย ${Math.round(g.span[0])}–${Math.round(g.span[1])}`));
 }
 const others=elems.filter(e=>!bars.includes(e)&&!solids.includes(e));
 if(others.length)lines.push(`องค์ประกอบอื่น (อ้างอิง): ${[...new Set(others.map(e=>e.type))].join(', ')}`);
 return {views:await renderIfcViews(solids.length?solids:elems,bars),text:lines.join('\n').slice(0,MAX_TEXT)};
}
function simplify(ring:[number,number][]):[number,number][]{
 const out:[number,number][]=[];for(const p of ring.slice(0,-1)){const q=out.at(-1);if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>2)out.push(p);}
 return out.filter((p,i)=>{const a=out[(i-1+out.length)%out.length],b=out[(i+1)%out.length];return Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))>Math.hypot(b[0]-a[0],b[1]-a[1])*2;}).slice(0,80);
}
async function renderIfcViews(solids:Elem[],bars:Elem[]){
 const THREE=await import('three');
 const all=[...solids,...bars],lo=[0,1,2].map(a=>minOf(all.map(e=>e.min[a]))),hi=[0,1,2].map(a=>maxOf(all.map(e=>e.max[a])));
 const c=new THREE.Vector3((lo[0]+hi[0])/2,(lo[2]+hi[2])/2,-(lo[1]+hi[1])/2),ext=maxOf(hi.map((h,a)=>h-lo[a]))||1;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#ffffff');scene.add(new THREE.AmbientLight(0xffffff,1.4));const sun=new THREE.DirectionalLight(0xffffff,1.2);sun.position.set(1,2,1.5);scene.add(sun);
 const geoOf=(list:Elem[])=>{const pos:number[]=[];for(const e of list)for(const t of e.tris)for(const p of t)pos.push(p[0],p[2],-p[1]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();return g;};
 const body=geoOf(solids);scene.add(new THREE.Mesh(body,new THREE.MeshLambertMaterial({color:0xc8d2d1,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false})));
 scene.add(new THREE.LineSegments(new THREE.EdgesGeometry(body,25),new THREE.LineBasicMaterial({color:0x222222})));
 if(bars.length)scene.add(new THREE.Mesh(geoOf(bars),new THREE.MeshLambertMaterial({color:0xc0563f})));
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,1200);
 const views:{label:string;data:string}[]=[];
 const shot=(label:string,dir:[number,number,number],up:[number,number,number]=[0,1,0])=>{
  const cam=new THREE.OrthographicCamera(-ext*.75*4/3,ext*.75*4/3,ext*.75,-ext*.75,-ext*10,ext*10);cam.up.set(...up);cam.position.copy(c).add(new THREE.Vector3(...dir).normalize().multiplyScalar(ext*3));cam.lookAt(c);
  renderer.render(scene,cam);views.push({label,data:renderer.domElement.toDataURL('image/jpeg',.85).split(',')[1]});
 };
 shot('IFC · แปลน (มองจากบน · X ขวา Y ขึ้น)',[0,1,0],[0,0,-1]);shot('IFC · รูปด้าน (มองไปทาง +Y · X ขวา Z ขึ้น)',[0,0,1]);shot('IFC · รูปด้าน (มองไปทาง −X · Y ขวา Z ขึ้น)',[1,0,0]);shot('IFC · 3D Isometric',[1,.8,1]);
 renderer.dispose();scene.traverse(o=>{const m=o as any;m.geometry?.dispose?.();m.material?.dispose?.();});
 return views;
}
