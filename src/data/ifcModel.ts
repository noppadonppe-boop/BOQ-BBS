import {IDENTITY,compose,dirOf,frameOf,toLocal,toWorld,v3,type Frame,type IfcBar,type IfcBarSet,type IfcElemKind,type IfcElement,type IfcModelData,type V3} from '../domain/ifcTypes';

// IFC reader for the BIM import: concrete elements (footings, pile caps, columns, piles …) with their body extents and
// every reinforcing bar as a centreline polyline (corners = intersections of the straight legs). Reads the raw STEP
// lines through web-ifc (no meshes for bars), so a 150 MB Revit file loads in a few seconds. Lengths → mm.

type Arg=any;
const X2=/\\X2\\([0-9A-F]+)\\X0\\/g;
const text=(a:Arg):string=>a==null?'':String(a.value??'').replace(X2,(_,h:string)=>String.fromCharCode(...(h.match(/.{4}/g)||[]).map(x=>parseInt(x,16)))).replace(/\\S\\(.)/g,(_,c:string)=>String.fromCharCode(c.charCodeAt(0)+128));
const num=(a:Arg)=>a==null?NaN:Number(a.value);
const ref=(a:Arg):number=>a&&a.type===5?Number(a.value):0;
const list=(a:Arg):Arg[]=>Array.isArray(a)?a:[];

const BODY_TYPES=['IFCFOOTING','IFCPILE','IFCSLAB','IFCCOLUMN','IFCBEAM','IFCWALL','IFCWALLSTANDARDCASE','IFCMEMBER','IFCBUILDINGELEMENTPROXY','IFCPLATE'] as const;

export async function readIfcModel(file:Blob,name:string,progress?:(s:string)=>void):Promise<IfcModelData>{
 const WebIFC:any=await import('web-ifc'),{default:wasmUrl}=await import('web-ifc/web-ifc.wasm?url');
 const api=new WebIFC.IfcAPI();await api.Init(()=>wasmUrl,true);
 progress?.(`เปิด ${name}…`);
 const bytes=new Uint8Array(await file.arrayBuffer());
 const head=new TextDecoder('latin1').decode(bytes.subarray(0,4000));
 const model=api.OpenModel(bytes);
 try{return read(api,WebIFC,model,name,head,progress);}finally{api.CloseModel(model);}
}

function read(api:any,W:any,model:number,file:string,head:string,progress?:(s:string)=>void):IfcModelData{
 const warnings:string[]=[];
 const cache=new Map<number,any>();
 const raw=(id:number):any=>{if(!id)return undefined;let r=cache.get(id);if(r===undefined){try{r=api.GetRawLineData(model,id);}catch{r=null;}if(cache.size<400000)cache.set(id,r);}return r||undefined;};
 const args=(id:number):Arg[]=>raw(id)?.arguments||[];
 const typeOf=(id:number):number=>raw(id)?.type??0;
 const ids=(t:number)=>{const v=api.GetLineIDsWithType(model,t),o:number[]=[];for(let i=0;i<v.size();i++)o.push(v.get(i));return o;};
 const T=(n:string)=>W[n] as number;
 // units: length → mm, plane angle → radians
 let toMm=1000,angle=1;
 // web-ifc drops the derived Dimensions (*) of IfcSIUnit: read the enums / labels wherever they are
 const words=(id:number)=>args(id).filter(x=>x&&(x.type===3||x.type===1)).map(text);
 for(const id of ids(T('IFCSIUNIT'))){const w=words(id);if(w[0]==='LENGTHUNIT'&&w.includes('METRE')){const p=w.length>2?w[1]:'';toMm=p==='MILLI'?1:p==='CENTI'?10:p==='DECI'?100:p==='KILO'?1e6:1000;}}
 for(const id of ids(T('IFCCONVERSIONBASEDUNIT'))){const w=words(id);if(w.includes('PLANEANGLEUNIT')&&w.some(x=>/DEG/i.test(x)))angle=Math.PI/180;}
 const tool:IfcModelData['tool']=/revit/i.test(head)?'Revit':/tekla/i.test(head)?'Tekla':'other';
 const app=(head.match(/FILE_NAME\([^;]*?'([^']*(?:Revit|Tekla|Archicad|Allplan|Bentley|IFC)[^']*)'/i)?.[1]||tool).slice(0,120);
 const schema=head.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/)?.[1]||'';

 // ---------------------------------------------------------------- geometry primitives
 const point=(id:number):V3=>{const c=list(args(id)[0]).map(num);return [(c[0]||0)*toMm,(c[1]||0)*toMm,(c[2]||0)*toMm];};
 const direction=(id:number):V3|undefined=>{if(!id)return undefined;const c=list(args(id)[0]).map(num);return v3.norm([c[0]||0,c[1]||0,c[2]||0]);};
 const placement=(id:number):Frame=>{
  if(!id)return IDENTITY;const t=typeOf(id),a=args(id);
  if(t===T('IFCAXIS2PLACEMENT3D'))return frameOf(point(ref(a[0])),direction(ref(a[1])),direction(ref(a[2])));
  if(t===T('IFCAXIS2PLACEMENT2D')){const o=point(ref(a[0])),x=direction(ref(a[1]));return frameOf([o[0],o[1],0],[0,0,1],x?[x[0],x[1],0]:undefined);}
  return IDENTITY;
 };
 const local=new Map<number,Frame>();
 const objectPlacement=(id:number,depth=0):Frame=>{
  if(!id||depth>40)return IDENTITY;const hit=local.get(id);if(hit)return hit;
  const a=args(id);let f=IDENTITY;
  if(typeOf(id)===T('IFCLOCALPLACEMENT'))f=compose(objectPlacement(ref(a[0]),depth+1),placement(ref(a[1])));
  local.set(id,f);return f;
 };
 const operator=(id:number):{f:Frame;s:number}=>{
  const a=args(id),x=direction(ref(a[0]))||[1,0,0],o=point(ref(a[2])),s=Number.isFinite(num(a[3]))?num(a[3]):1;
  const z=direction(ref(a[4]))||v3.norm(v3.cross(x,direction(ref(a[1]))||[0,1,0]));
  return {f:frameOf(o,z,x),s};
 };
 const scaled=(f:Frame,s:number):Frame=>s===1?f:{o:f.o,x:v3.mul(f.x,s),y:v3.mul(f.y,s),z:v3.mul(f.z,s)};

 // ---------------------------------------------------------------- curves → straight legs / arcs
 type Piece={kind:'line';a:V3;b:V3}|{kind:'arc';pts:V3[];r:number};
 const trimValue=(a:Arg[]):{t?:number;p?:V3}=>{for(const x of a){if(x?.type===5)return {p:point(ref(x))};if(x?.type===2||x?.type===4)return {t:num(x)};}return {};};
 const curve=(id:number,depth=0):Piece[]=>{
  if(!id||depth>8)return [];const t=typeOf(id),a=args(id);
  if(t===T('IFCPOLYLINE')){const p=list(a[0]).map(x=>point(ref(x)));return p.slice(1).map((q,i)=>({kind:'line',a:p[i],b:q}));}
  if(t===T('IFCINDEXEDPOLYCURVE')){const pl=args(ref(a[0])),c=list(pl[0]).map(r=>{const v=list(r).map(num);return [(v[0]||0)*toMm,(v[1]||0)*toMm,(v[2]||0)*toMm] as V3;});
   const segs=list(a[1]);if(!segs.length)return c.slice(1).map((q,i)=>({kind:'line',a:c[i],b:q}));
   return segs.flatMap((s:Arg):Piece[]=>{const ix=list(s.value??s).map(x=>num(x)-1).filter(i=>c[i]);const pts=ix.map(i=>c[i]);
    return /ARC/i.test(String(s.label||s.typecode||''))&&pts.length===3?[{kind:'arc',pts,r:circleR(pts)}]:pts.slice(1).map((q,i)=>({kind:'line',a:pts[i],b:q}));});}
  if(t===T('IFCCOMPOSITECURVE'))return list(a[0]).flatMap(s=>{const sa=args(ref(s)),out=curve(ref(sa[2]),depth+1);return text(sa[1])===String(false)||sa[1]?.value===false?reverse(out):out;});
  if(t===T('IFCTRIMMEDCURVE')){
   const basis=ref(a[0]),bt=typeOf(basis),ba=args(basis),t1=trimValue(list(a[1])),t2=trimValue(list(a[2])),sense=a[3]?.value!==false;
   if(bt===T('IFCLINE')){const p0=point(ref(ba[0])),va=args(ref(ba[1])),d=direction(ref(va[0]))||[1,0,0],mag=(num(va[1])||1)*toMm;
    const at=(v:{t?:number;p?:V3})=>v.p||v3.add(p0,v3.mul(d,(v.t||0)*mag));const p=[at(t1),at(t2)];return [{kind:'line',a:sense?p[0]:p[1],b:sense?p[1]:p[0]}];}
   if(bt===T('IFCCIRCLE')||bt===T('IFCELLIPSE')){
    const f=placement(ref(ba[0])),r=num(ba[1])*toMm,ang=(v:{t?:number;p?:V3})=>v.p?Math.atan2(v3.dot(v3.sub(v.p,f.o),f.y),v3.dot(v3.sub(v.p,f.o),f.x)):(v.t||0)*angle;
    let s=ang(t1),e=ang(t2);if(sense){while(e<s)e+=2*Math.PI;}else{while(e>s)e-=2*Math.PI;}
    const n=Math.max(2,Math.min(24,Math.ceil(Math.abs(e-s)/(Math.PI/12)))),pts=Array.from({length:n+1},(_,k)=>{const q=s+(e-s)*k/n;return toWorld(f,[r*Math.cos(q),r*Math.sin(q),0]);});
    return [{kind:'arc',pts,r}];}
   return curve(basis,depth+1);
  }
  if(t===T('IFCCIRCLE')){const f=placement(ref(a[0])),r=num(a[1])*toMm;return [{kind:'arc',r,pts:Array.from({length:25},(_,k)=>toWorld(f,[r*Math.cos(k*Math.PI/12),r*Math.sin(k*Math.PI/12),0]))}];}
  return [];
 };
 const reverse=(ps:Piece[]):Piece[]=>ps.slice().reverse().map(p=>p.kind==='line'?{kind:'line',a:p.b,b:p.a}:{...p,pts:p.pts.slice().reverse()});

 // ---------------------------------------------------------------- property sets, assemblies, storeys
 const props=new Map<number,Record<string,string>>();
 for(const id of ids(T('IFCRELDEFINESBYPROPERTIES'))){
  const a=args(id),def=ref(a[5]);if(typeOf(def)!==T('IFCPROPERTYSET'))continue;
  const pa=args(def),set=text(pa[2]),values:Record<string,string>={};
  for(const p of list(pa[4])){const q=args(ref(p));if(!q.length)continue;const v=q[2];if(v==null)continue;values[`${set}.${text(q[0])}`]=text(v).trim();}
  for(const o of list(a[4])){const k=ref(o),cur=props.get(k)||{};props.set(k,Object.assign(cur,values));}
 }
 const prop=(id:number,...names:string[])=>{const p=props.get(id);if(!p)return '';for(const n of names){const hit=Object.entries(p).find(([k,v])=>v&&(k===n||k.endsWith('.'+n)));if(hit)return hit[1];}return '';};
 const assemblyOf=new Map<number,number>(),parentOf=new Map<number,number>();
 const assemblies=new Set(ids(T('IFCELEMENTASSEMBLY')));
 for(const id of ids(T('IFCRELAGGREGATES'))){const a=args(id),p=ref(a[4]);for(const c of list(a[5])){parentOf.set(ref(c),p);if(assemblies.has(p))assemblyOf.set(ref(c),p);}}
 const storeyOf=new Map<number,string>(),storeys=ids(T('IFCBUILDINGSTOREY')).map(id=>{const a=args(id);return {id,guid:text(a[0]),name:text(a[2])||text(a[7])||`#${id}`,elevation:(num(a[9])||0)*toMm};});
 const storeyName=new Map(storeys.map(s=>[s.id,s.name]));
 for(const id of ids(T('IFCRELCONTAINEDINSPATIALSTRUCTURE'))){const a=args(id),s=storeyName.get(ref(a[5]));if(s)for(const e of list(a[4]))storeyOf.set(ref(e),s);}
 const storeyFor=(id:number)=>storeyOf.get(id)||storeyOf.get(assemblyOf.get(id)||0)||storeyOf.get(parentOf.get(id)||0)||'';
 const groupOf=new Map<number,string>();
 for(const id of ids(T('IFCRELASSIGNSTOGROUP'))){const a=args(id),g=args(ref(a[6]));const n=text(g[2]).replace(/^Model Group:/,'');if(!n)continue;for(const o of list(a[4]))groupOf.set(ref(o),n.replace(/:\d+$/,''));}

 // ---------------------------------------------------------------- body items (concrete elements)
 type Body={pts:V3[];vertical:boolean;outline?:[number,number][];circle?:boolean;approx?:boolean;frame?:Frame};
 const profile=(id:number):{pts:[number,number][];circle?:boolean}|undefined=>{
  const t=typeOf(id),a=args(id);
  if(t===T('IFCRECTANGLEPROFILEDEF')||t===T('IFCROUNDEDRECTANGLEPROFILEDEF')||t===T('IFCRECTANGLEHOLLOWPROFILEDEF')){const f=placement(ref(a[2])),w=num(a[3])*toMm/2,h=num(a[4])*toMm/2;
   return {pts:([[-w,-h],[w,-h],[w,h],[-w,h]] as [number,number][]).map(([x,y])=>{const p=toWorld(f,[x,y,0]);return [p[0],p[1]] as [number,number];})};}
  if(t===T('IFCCIRCLEPROFILEDEF')||t===T('IFCCIRCLEHOLLOWPROFILEDEF')){const f=placement(ref(a[2])),r=num(a[3])*toMm;return {circle:true,pts:Array.from({length:24},(_,k)=>{const p=toWorld(f,[r*Math.cos(k*Math.PI/12),r*Math.sin(k*Math.PI/12),0]);return [p[0],p[1]] as [number,number];})};}
  if(t===T('IFCARBITRARYCLOSEDPROFILEDEF')||t===T('IFCARBITRARYPROFILEDEFWITHVOIDS')){const ps=curve(ref(a[2]));const pts:[number,number][]=[];for(const p of ps){const seq=p.kind==='line'?[p.a,p.b]:p.pts;for(const q of seq){const l=pts.at(-1);if(!l||Math.hypot(l[0]-q[0],l[1]-q[1])>.5)pts.push([q[0],q[1]]);}}
   if(pts.length>2&&Math.hypot(pts[0][0]-pts.at(-1)![0],pts[0][1]-pts.at(-1)![1])<.5)pts.pop();return pts.length>2?{pts}:undefined;}
  return undefined;
 };
 const body=(id:number,f:Frame,depth=0):Body[]=>{
  if(!id||depth>6)return [];const t=typeOf(id),a=args(id);
  if(t===T('IFCEXTRUDEDAREASOLID')){
   const pr=profile(ref(a[0]));if(!pr)return [];const pos=compose(f,placement(ref(a[1]))),d=direction(ref(a[2]))||[0,0,1],depthMm=num(a[3])*toMm;
   const ext=v3.mul(d,depthMm),pts=pr.pts.flatMap(([x,y])=>[toWorld(pos,[x,y,0]),toWorld(pos,v3.add([x,y,0],ext))]);
   return [{pts,vertical:Math.abs(dirOf(pos,d)[2])>.999,outline:pr.pts,circle:pr.circle,frame:pos}];
  }
  if(t===T('IFCBOOLEANCLIPPINGRESULT')||t===T('IFCBOOLEANRESULT'))return body(ref(a[1]),f,depth+1).map(b=>({...b,approx:true}));
  if(t===T('IFCMAPPEDITEM')){const src=args(ref(a[0])),op=operator(ref(a[1])),org=placement(ref(src[0])),g=compose(compose(f,scaled(op.f,op.s)),org);
   return list(args(ref(src[1]))[3]).flatMap(x=>body(ref(x),g,depth+1));}
  return [];
 };
 /** m³ of the closed mesh of an element (signed tetrahedra), 0 when it cannot be meshed */
 const meshVolume=(id:number):number=>{
  try{const mesh=api.GetFlatMesh(model,id);let v6=0;
   for(let g=0;g<mesh.geometries.size();g++){const pg=mesh.geometries.get(g),geo=api.GetGeometry(model,pg.geometryExpressID),m=pg.flatTransformation,v=api.GetVertexArray(geo.GetVertexData(),geo.GetVertexDataSize()),ix=api.GetIndexArray(geo.GetIndexData(),geo.GetIndexDataSize());
    const P=(i:number)=>{const x=v[i*6],y=v[i*6+1],z=v[i*6+2];return [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];};
    for(let i=0;i+2<ix.length;i+=3){const a=P(ix[i]),b=P(ix[i+1]),c=P(ix[i+2]);v6+=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);}
    geo.delete();}
   return Math.abs(v6)/6;}catch{return 0;}
 };
 const meshBox=(id:number):V3[]=>{
  try{const mesh=api.GetFlatMesh(model,id),out:V3[]=[];
   for(let g=0;g<mesh.geometries.size();g++){const pg=mesh.geometries.get(g),geo=api.GetGeometry(model,pg.geometryExpressID),m=pg.flatTransformation,v=api.GetVertexArray(geo.GetVertexData(),geo.GetVertexDataSize());
    for(let i=0;i<v.length;i+=6){const x=v[i],y=v[i+1],z=v[i+2],wx=m[0]*x+m[4]*y+m[8]*z+m[12],wy=m[1]*x+m[5]*y+m[9]*z+m[13],wz=m[2]*x+m[6]*y+m[10]*z+m[14];out.push([wx*1000,-wz*1000,wy*1000]);}
    geo.delete();}
   return out;}catch{return [];}
 };
 const representationItems=(rep:number):number[]=>list(args(rep)[2]).flatMap(r=>{const ra=args(ref(r));return /body|facetation/i.test(text(ra[1]))||!text(ra[1])?list(ra[3]).map(ref):[];});

 const kindOf=(type:string,label:string,predef:string):IfcElemKind=>{
  if(type==='IFCFOOTING')return 'footing';if(type==='IFCPILE')return 'pile';
  if(/pile\s*cap|foundation|footing|ฐานราก|\bF\d/i.test(label)&&!/foundation\s*wall/i.test(label))return /pile(?!\s*cap)/i.test(label)&&!/pile\s*cap/i.test(label)&&!/foundation/i.test(label)?'pile':'footing';
  if(/\bpile\b|เข็ม/i.test(label))return 'pile';
  if(type==='IFCCOLUMN')return 'column';if(type==='IFCBEAM')return 'beam';if(type.startsWith('IFCWALL'))return 'wall';
  if(type==='IFCSLAB')return predef==='BASESLAB'&&/found|cap/i.test(label)?'footing':'slab';
  return 'other';
 };
 progress?.('อ่านองค์อาคาร…');
 const elements:IfcElement[]=[];
 for(const typeName of BODY_TYPES){const code=T(typeName);if(!code)continue;
  for(const id of ids(code)){
   const a=args(id),label=[text(a[2]),text(a[4])].join(' '),kind=kindOf(typeName,label,text(a[8]));
   if(kind==='other'&&typeName!=='IFCBUILDINGELEMENTPROXY')continue;
   if(typeName==='IFCBEAM'&&/H-SECTION|STEEL|TIS_|HP\s|\bH\d/i.test(label))continue;
   const pl=objectPlacement(ref(a[5])),items=representationItems(ref(a[6]));
   let bodies=items.flatMap(it=>body(it,pl));
   let approx=bodies.some(b=>b.approx);
   if(!bodies.length){const pts=meshBox(id);if(!pts.length)continue;bodies=[{pts,vertical:false}];approx=true;}
   // frame: the first vertical extrusion (its profile axes = the element's sides), else the object placement
   const main=bodies.find(b=>b.vertical&&b.frame),fr=main?.frame||pl,hx=[fr.x,fr.y,fr.z].find(d=>Math.abs(d[2])<.999)||[1,0,0];
   const frame=frameOf(fr.o,[0,0,1],[hx[0],hx[1],0]);
   const loc=bodies.flatMap(b=>b.pts.map(p=>toLocal(frame,p)));
   const min:V3=[0,1,2].map(k=>Math.min(...loc.map(p=>p[k]))) as V3,max:V3=[0,1,2].map(k=>Math.max(...loc.map(p=>p[k]))) as V3;
   let outline:[number,number][]|undefined;
   if(bodies.length===1&&main?.outline&&main.frame){outline=main.outline.map(([x,y])=>{const p=toLocal(frame,toWorld(main.frame!,[x,y,0]));return [p[0],p[1]] as [number,number];});}
   const pr:Record<string,string>={...(props.get(id)||{})},asm=assemblyOf.get(id);
   const mark=(prop(id,'Reference','Type Mark','Mark')||prop(asm||0,'Assembly mark')||prop(id,'Assembly mark')||text(a[2])).replace(/\/\d+$/,'').replace(/^.*:/,'').trim();
   elements.push({guid:text(a[0]),ifcType:typeName,kind,name:text(a[2]).replace(/:\d+$/,''),mark:mark.slice(0,50),storey:storeyFor(id),assembly:asm?text(args(asm)[0]):undefined,file,frame,min,max,
    ...(outline?{outline}:{}),...(main?.circle?{circle:true}:{}),...(approx||bodies.length>1?{approx:true,...(kind==='footing'?{volume:Number(meshVolume(id).toFixed(4))}:{})}:{}),grade:prop(id,'Grade','Structural Material','Material')||undefined,props:pr});
  }
 }

 // ---------------------------------------------------------------- reinforcing bars
 progress?.('อ่านเหล็กเสริม…');
 const barSets:IfcBarSet[]=[];
 const barItems=(id:number,f:Frame,depth=0):{pieces:Piece[];r:number;f:Frame}[]=>{
  if(!id||depth>6)return [];const t=typeOf(id),a=args(id);
  if(t===T('IFCSWEPTDISKSOLID')||t===T('IFCSWEPTDISKSOLIDPOLYGONAL'))return [{pieces:curve(ref(a[0])),r:num(a[1])*toMm,f}];
  if(t===T('IFCMAPPEDITEM')){const src=args(ref(a[0])),op=operator(ref(a[1])),org=placement(ref(src[0])),g=compose(compose(f,scaled(op.f,op.s)),org);
   return list(args(ref(src[1]))[3]).flatMap(x=>barItems(ref(x),g,depth+1));}
  if(t===T('IFCBOOLEANCLIPPINGRESULT')||t===T('IFCBOOLEANRESULT'))return barItems(ref(a[1]),f,depth+1);
  return [];
 };
 const toBar=(pieces:Piece[],f:Frame):IfcBar|undefined=>{
  const w=(p:V3)=>toWorld(f,p);
  const lines=pieces.filter(p=>p.kind==='line'&&v3.len(v3.sub(p.b,p.a))>.5) as {kind:'line';a:V3;b:V3}[];
  const arcs=pieces.filter(p=>p.kind==='arc') as {kind:'arc';pts:V3[];r:number}[];
  const radius=arcs.length?Math.min(...arcs.map(a=>a.r)):0;
  if(!lines.length){const pts=arcs.flatMap(a=>a.pts);return pts.length>1?{pts:thin(pts.map(w),100),radius}:undefined;}
  const pts:V3[]=[lines[0].a];
  for(let i=0;i+1<lines.length;i++){const c=corner(lines[i],lines[i+1]);if(c)pts.push(c);else pts.push(lines[i].b,lines[i+1].a);}
  pts.push(lines.at(-1)!.b);
  return {pts:thin(pts.map(w),100),radius};
 };
 const rebarCode=T('IFCREINFORCINGBAR');
 for(const id of rebarCode?ids(rebarCode):[]){
  const a=args(id),label=text(a[2]),pl=objectPlacement(ref(a[5])),items=representationItems(ref(a[6]));
  const geo=items.flatMap(it=>barItems(it,pl));
  const bars=geo.map(g=>toBar(g.pieces,g.f)).filter((b):b is IfcBar=>!!b);
  if(!bars.length)continue;
  const sizeProp=Number(prop(id,'Size','Bar Diameter','Nominal Diameter').replace(/[^\d.]/g,'')),nominal=num(a[9])*(num(a[9])<1?1000:toMm),fromName=Number(label.match(/(?:DB|RB|Ø|T|Y|D)\s?(\d{1,2})\s*mm/i)?.[1]),swept=2*Math.max(...geo.map(g=>g.r));
  const diameter=[sizeProp,nominal,fromName,swept].find(d=>Number.isFinite(d)&&d>=4&&d<=60)||0;
  if(!diameter){warnings.push(`${label||'#'+id}: ไม่พบขนาดเหล็ก`);continue;}
  const asm=assemblyOf.get(id);
  barSets.push({guid:text(a[0]),name:label.replace(/:\d+$/,'').slice(0,120),file,mark:prop(id,'Rebar Mark','Schedule Mark','Rebar Number','Mark').slice(0,20),diameter,
   grade:(prop(id,'Grade')||text(a[8])).slice(0,40),shape:(prop(id,'Shape','ISOCD3766ShapeCode','Shape Code','BendingShapeCode')||label.match(/Shape\s+([^:]+)/i)?.[1]||'').trim().slice(0,40),
   assembly:asm?text(args(asm)[0]):undefined,group:groupOf.get(id),storey:storeyFor(id),
   length:Number(prop(id,'Length','Bar Length'))||(Number.isFinite(num(a[11]))?num(a[11])*toMm:0),weight:Number(prop(id,'Weight'))||0,bars});
 }
 if(!elements.some(e=>e.kind==='footing'||e.kind==='column'||e.kind==='beam'))warnings.push('ไม่พบฐานราก / เสา / คานในไฟล์นี้');
 if(!barSets.length)warnings.push('ไม่มีเหล็กเสริม (IfcReinforcingBar) ในไฟล์นี้');
 return {file,app,tool,schema,storeys:storeys.map(({id:_,...s})=>s),elements,barSets,warnings};
}

/** Corner of two consecutive straight legs: closest point of the two lines (legs joined by a bend). */
function corner(p:{a:V3;b:V3},q:{a:V3;b:V3}):V3|undefined{
 const d1=v3.sub(p.b,p.a),d2=v3.sub(q.b,q.a),r=v3.sub(p.a,q.a),a=v3.dot(d1,d1),e=v3.dot(d2,d2),b=v3.dot(d1,d2),c=v3.dot(d1,r),f=v3.dot(d2,r),den=a*e-b*b;
 if(den<1e-9*a*e)return undefined; // parallel (180° hook): keep both ends
 const s=(b*f-c*e)/den,t=(a*f-b*c)/den,P=v3.add(p.a,v3.mul(d1,s)),Q=v3.add(q.a,v3.mul(d2,t));
 if(v3.len(v3.sub(P,Q))>Math.max(5,.05*Math.sqrt(Math.min(a,e))))return undefined;
 return v3.mul(v3.add(P,Q),.5);
}
function circleR(p:V3[]){const a=v3.len(v3.sub(p[1],p[0])),b=v3.len(v3.sub(p[2],p[1])),c=v3.len(v3.sub(p[2],p[0])),s=v3.len(v3.cross(v3.sub(p[1],p[0]),v3.sub(p[2],p[0])));return s>1e-9?a*b*c/(2*s):0;}
function thin(p:V3[],max:number):V3[]{
 const out:V3[]=[];for(const q of p){const l=out.at(-1);if(!l||v3.len(v3.sub(q,l))>.5)out.push(q);}
 if(out.length<=max)return out;const step=(out.length-1)/(max-1);return Array.from({length:max},(_,i)=>out[Math.round(i*step)]);
}
