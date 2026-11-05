// S4a: normalized drawing geometry for the slab-floor underlay, its snap and the DXF plan import (docs/SLAB_FLOOR.md
// “Tracing / Import”). Pure: DXF = a parsed dxf-parser object (blocks expanded, layer 0 inside a block takes the INSERT's
// layer), PDF = a pdf.js operator list (paths with the current transform applied, in page points, y up). No DOM here.
export type P2=[number,number];
export type CadEnt=
 |{k:'line';a:P2;b:P2;layer:string;h:string;lt?:string}
 |{k:'poly';pts:P2[];closed:boolean;layer:string;h:string;lt?:string}
 |{k:'circle';c:P2;r:number;layer:string;h:string}
 |{k:'arc';c:P2;r:number;a0:number;a1:number;layer:string;h:string}
 |{k:'text';at:P2;text:string;size:number;rot:number;layer:string;h:string;
  /** PDF: measured text width along its direction (source units) */ w?:number};
export type CadLayer={name:string;color:number;count:number};
export type CadUnits='mm'|'cm'|'m'|'inch';
/** Geometry of one source (DXF model space, or one PDF page). `segCount` = straight pieces (arcs / circles in 16ths). */
export type CadDoc={kind:'dxf'|'pdf';ents:CadEnt[];layers:CadLayer[];bounds:[number,number,number,number];segCount:number;
 /** DXF $INSUNITS (absent / 0 = not given) */ insunits?:number;
 /** PDF page box (points) and size */ page?:{x0:number;y0:number;w:number;h:number}};
/** Entities / segments above this many: the snap index covers the visible window only (and the page warns). */
export const SNAP_LIMIT=200000;
export const UNIT_MM:Record<CadUnits,number>={mm:1,cm:10,m:1000,inch:25.4};
/** $INSUNITS code → units (1 inch, 4 mm, 5 cm, 6 m); undefined = ask the user. */
export const insUnits=(code:number|undefined):CadUnits|undefined=>({1:'inch',4:'mm',5:'cm',6:'m'} as Record<number,CadUnits>)[Number(code)];

type Xf={a:number;b:number;c:number;d:number;e:number;f:number};
const I:Xf={a:1,b:0,c:0,d:1,e:0,f:0};
const ap=(t:Xf,x:number,y:number):P2=>[t.a*x+t.c*y+t.e,t.b*x+t.d*y+t.f];
const mul=(o:Xf,i:Xf):Xf=>({a:o.a*i.a+o.c*i.b,b:o.b*i.a+o.d*i.b,c:o.a*i.c+o.c*i.d,d:o.b*i.c+o.d*i.d,e:o.a*i.e+o.c*i.f+o.e,f:o.b*i.e+o.d*i.f+o.f});
const xfScale=(t:Xf)=>Math.sqrt(Math.abs(t.a*t.d-t.b*t.c));
const cleanText=(t:string)=>t.replace(/\\P/g,' ').replace(/\\[A-Za-z][^;\\{}]*;/g,'').replace(/\\[A-Za-z]/g,'').replace(/[{}]/g,'').replace(/%%[uUoO]/g,'').replace(/%%[cC]/g,'Ø').replace(/%%[dD]/g,'°').replace(/%%[pP]/g,'±').replace(/\s+/g,' ').trim();

/** Bulge arc between two polyline vertices → points (without the first). */
function bulgePts(p:P2,q:P2,bulge:number):P2[]{
 const th=4*Math.atan(bulge),L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(Math.abs(th)<1e-6||L<1e-9)return [q];
 const r=L/(2*Math.sin(th/2)),mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2,h=r*Math.cos(th/2),nx=-(q[1]-p[1])/L,ny=(q[0]-p[0])/L;
 const cx=mx+nx*h,cy=my+ny*h,a0=Math.atan2(p[1]-cy,p[0]-cx),n=Math.max(2,Math.ceil(Math.abs(th)/(Math.PI/16))),R=Math.abs(r);
 const out:P2[]=[];for(let i=1;i<n;i++){const a=a0+th*i/n;out.push([cx+R*Math.cos(a),cy+R*Math.sin(a)]);}out.push(q);return out;
}

/** dxf-parser output → entities in drawing units (model space; INSERT blocks expanded, nested ≤ 8). */
export function dxfDoc(dxf:any):CadDoc{
 const ents:CadEnt[]=[];let n=0;
 const walk=(list:any[],t:Xf,layerOf:(l:string)=>string,depth:number,hPrefix:string)=>{
  for(const e of list||[]){
   const layer=layerOf(String(e.layer??'0')),h=hPrefix+String(e.handle??`#${n++}`),lt=e.lineType?String(e.lineType):undefined;
   switch(e.type){
    case 'LINE':{const [a,b]=e.vertices||[];if(a&&b)ents.push({k:'line',a:ap(t,a.x,a.y),b:ap(t,b.x,b.y),layer,h,...(lt?{lt}:{})});break;}
    case 'LWPOLYLINE':case 'POLYLINE':{const v=(e.vertices||[]) as any[];if(v.length<2)break;const closed=!!(e.shape||e.closed);const pts:P2[]=[[v[0].x,v[0].y]];
     const m=closed?v.length:v.length-1;for(let i=0;i<m;i++){const p=v[i],q=v[(i+1)%v.length];if(p.bulge)pts.push(...bulgePts([p.x,p.y],[q.x,q.y],p.bulge));else if(i+1<v.length)pts.push([q.x,q.y]);}
     if(closed&&pts.length>1&&pts.at(-1)![0]===pts[0][0]&&pts.at(-1)![1]===pts[0][1])pts.pop();
     ents.push({k:'poly',pts:pts.map(p=>ap(t,p[0],p[1])),closed,layer,h,...(lt?{lt}:{})});break;}
    case 'CIRCLE':{if(!e.center)break;const s=xfScale(t);ents.push({k:'circle',c:ap(t,e.center.x,e.center.y),r:e.radius*s,layer,h});break;}
    case 'ARC':{if(!e.center)break;const s=xfScale(t),rot=Math.atan2(t.b,t.a);ents.push({k:'arc',c:ap(t,e.center.x,e.center.y),r:e.radius*s,a0:e.startAngle+rot,a1:e.endAngle+rot,layer,h});break;}
    case 'SOLID':{const v=((e.points||[]) as any[]).filter(Boolean);if(v.length<3)break;const pts=(v.length===4?[v[0],v[1],v[3],v[2]]:v).map((p:any)=>ap(t,p.x,p.y));ents.push({k:'poly',pts,closed:true,layer,h});break;}
    case 'SPLINE':{const pts=((e.fitPoints?.length?e.fitPoints:e.controlPoints)||[]) as any[];if(pts.length>1)ents.push({k:'poly',pts:pts.map(p=>ap(t,p.x,p.y)),closed:!!e.closed,layer,h});break;}
    case 'TEXT':case 'MTEXT':case 'ATTRIB':{const p=(e.type==='TEXT'&&(e.halign||e.valign)&&e.endPoint)?e.endPoint:(e.startPoint||e.position);const text=cleanText(String(e.text||''));
     if(p&&text)ents.push({k:'text',at:ap(t,p.x,p.y),text,size:Math.abs((e.textHeight||e.height||2.5)*xfScale(t)),rot:Math.atan2(t.b,t.a)+(e.rotation||0)*Math.PI/180,layer,h});break;}
    case 'INSERT':{
     const block=dxf.blocks?.[e.name];if(!block||depth>=8)break;
     const base=block.position||{x:0,y:0},r=(e.rotation||0)*Math.PI/180,sx=e.xScale??1,sy=e.yScale??1,cr=Math.cos(r),sr=Math.sin(r);
     const inner:Xf={a:cr*sx,b:sr*sx,c:-sr*sy,d:cr*sy,e:e.position?.x||0,f:e.position?.y||0},bt=mul(mul(t,inner),{...I,e:-base.x,f:-base.y});
     const own=layer;walk(block.entities,bt,l=>l==='0'?own:l,depth+1,`${h}/`);break;}
   }
  }
 };
 const top=(dxf?.entities||[]) as any[],model=top.filter(e=>!e.inPaperSpace);
 walk(model.length?model:top,I,l=>l,0,'');
 const colors=dxf?.tables?.layer?.layers||{};
 return finish({kind:'dxf',ents,insunits:dxf?.header?.$INSUNITS!==undefined?Number(dxf.header.$INSUNITS):undefined},colors);
}
function finish(d:{kind:'dxf'|'pdf';ents:CadEnt[];insunits?:number;page?:CadDoc['page']},colors:Record<string,{colorIndex?:number}>={}):CadDoc{
 const count=new Map<string,number>();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,segs=0;
 const g=(p:P2)=>{if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))return;if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];};
 for(const e of d.ents){count.set(e.layer,(count.get(e.layer)||0)+1);
  if(e.k==='line'){g(e.a);g(e.b);segs++;}else if(e.k==='poly'){e.pts.forEach(g);segs+=e.pts.length-(e.closed?0:1);}else if(e.k==='text')g(e.at);else{g([e.c[0]-e.r,e.c[1]-e.r]);g([e.c[0]+e.r,e.c[1]+e.r]);segs+=16;}}
 const names=new Set([...count.keys(),...Object.keys(colors)]);
 const layers=[...names].map(name=>({name,color:Number(colors[name]?.colorIndex??7),count:count.get(name)||0})).sort((a,b)=>a.name.localeCompare(b.name));
 const bounds:[number,number,number,number]=Number.isFinite(x0)?[x0,y0,x1,y1]:[0,0,0,0];
 return {...d,layers,bounds,segCount:segs};
}

/** Straight pieces of an entity (arcs / circles as chords). */
export function entSegments(e:CadEnt,out:[number,number,number,number][]=[]){
 if(e.k==='line')out.push([e.a[0],e.a[1],e.b[0],e.b[1]]);
 else if(e.k==='poly'){const p=e.pts;for(let i=1;i<p.length;i++)out.push([p[i-1][0],p[i-1][1],p[i][0],p[i][1]]);if(e.closed&&p.length>2)out.push([p.at(-1)![0],p.at(-1)![1],p[0][0],p[0][1]]);}
 else if(e.k==='circle'||e.k==='arc'){let a0=e.k==='arc'?e.a0:0,sw=e.k==='arc'?e.a1-e.a0:2*Math.PI;if(sw<=0)sw+=2*Math.PI;const n=Math.max(4,Math.ceil(sw/(Math.PI/8)));
  let p:P2=[e.c[0]+e.r*Math.cos(a0),e.c[1]+e.r*Math.sin(a0)];for(let i=1;i<=n;i++){const a=a0+sw*i/n,q:P2=[e.c[0]+e.r*Math.cos(a),e.c[1]+e.r*Math.sin(a)];out.push([p[0],p[1],q[0],q[1]]);p=q;}}
 return out;
}

/** Text items of `page.getTextContent()` (PDF user space). */
export type PdfTextItem={str:string;transform:number[];width:number;height?:number};
/** Pseudo-layer of a PDF path: the optional-content layer (OCG) when the path is marked with one, else stroke colour + line
 * width (mm on paper) + dash kind, e.g. `#FF0000 · 0.35 · dashdot`. Texts go to `TEXT`. */
export const PDF_TEXT_LAYER='TEXT';
export function pdfStyleLayer(color:string,widthMm:number,dash:'solid'|'dash'|'dashdot'){return `${color.toUpperCase()} · ${widthMm.toFixed(2)}${dash==='solid'?'':` · ${dash}`}`;}
const dashKind=(arr:ArrayLike<number>|undefined):'solid'|'dash'|'dashdot'=>{const a=Array.from(arr||[]).filter(v=>v>=0);if(!a.length||a.every(v=>v===0))return 'solid';
 const marks=a.filter((_,i)=>i%2===0),max=Math.max(...marks);return marks.length>=2&&Math.min(...marks)<max*0.4?'dashdot':'dash';};
/** pdf.js operator list of one page → path entities (page points, y up as in PDF user space). `ops` = pdfjs `OPS`.
 * Paths are taken from painting `constructPath` operators (stroke / fill), with the current transform (cm, q / Q, form
 * XObjects). Curves keep their end points; a closed path of 4+ curves round one centre becomes a circle. Each path is put on
 * its pseudo-layer (OCG name via `o.ocName`, else colour / width / dash; fills without a stroke use the fill colour).
 * `o.texts` (getTextContent items) become text entities on `TEXT` (size = font height, `w` = measured width). */
export function pdfDoc(list:{fnArray:ArrayLike<number>;argsArray:any[]},ops:Record<string,number>,view:[number,number,number,number],
 o:{limit?:number;ocName?:(props:unknown)=>string|undefined;texts?:PdfTextItem[]}={}):CadDoc{
 const limit=o.limit??SNAP_LIMIT*2;
 type G={t:Xf;stroke:string;fill:string;width:number;dash:'solid'|'dash'|'dashdot'};
 const ents:CadEnt[]=[],stack:G[]=[],mc:(string|undefined)[]=[];let g:G={t:I,stroke:'#000000',fill:'#000000',width:1,dash:'solid'},n=0,segs=0,truncated=false;
 const strokeOps=new Set([ops.stroke,ops.closeStroke,ops.fillStroke,ops.eoFillStroke,ops.closeFillStroke,ops.closeEOFillStroke].filter(v=>v!==undefined));
 const paint=new Set([...strokeOps,ops.fill,ops.eoFill].filter(v=>v!==undefined));
 const oc=()=>{for(let k=mc.length-1;k>=0;k--)if(mc[k])return mc[k];return undefined;};
 const hex=(c:unknown)=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)?c:Array.isArray(c)&&c.length>=3?`#${c.slice(0,3).map(v=>Math.round(Number(v)).toString(16).padStart(2,'0')).join('')}`:'#000000';
 for(let i=0;i<list.fnArray.length&&!truncated;i++){
  const fn=list.fnArray[i],args=list.argsArray[i];
  if(fn===ops.save)stack.push({...g});
  else if(fn===ops.restore)g=stack.pop()||g;
  else if(fn===ops.transform){const [a,b,c,d,e,f]=args as number[];g={...g,t:mul(g.t,{a,b,c,d,e,f})};}
  else if(fn===ops.paintFormXObjectBegin){stack.push({...g});const m=args?.[0];if(Array.isArray(m)||ArrayBuffer.isView(m)){const [a,b,c,d,e,f]=Array.from(m as ArrayLike<number>);g={...g,t:mul(g.t,{a,b,c,d,e,f})};}}
  else if(fn===ops.paintFormXObjectEnd)g=stack.pop()||g;
  else if(fn===ops.setLineWidth)g={...g,width:Number(args?.[0])||0};
  else if(fn===ops.setDash)g={...g,dash:dashKind(args?.[0])};
  else if(fn===ops.setStrokeRGBColor)g={...g,stroke:hex(args?.[0])};
  else if(fn===ops.setFillRGBColor)g={...g,fill:hex(args?.[0])};
  else if(fn===ops.beginMarkedContentProps)mc.push(args?.[0]==='OC'?o.ocName?.(args?.[1]):undefined);
  else if(fn===ops.beginMarkedContent)mc.push(undefined);
  else if(fn===ops.endMarkedContent)mc.pop();
  else if(fn===ops.constructPath){
   const [op,data]=args as [number,any[]];if(!paint.has(op))continue;
   const path=data?.[0] as ArrayLike<number>|null;if(!path)continue;
   const stroked=strokeOps.has(op),widthMm=Math.max(0,g.width*xfScale(g.t))*25.4/72,layer=oc()||pdfStyleLayer(stroked?g.stroke:g.fill,widthMm,stroked?g.dash:'solid');
   let cur:P2[]=[],curves=0,lines=0;
   const flush=(closed:boolean)=>{
    if(cur.length>1){
     // a closed run of curves round one centre (no straight pieces) = circle
     const ends=cur.length>2&&Math.hypot(cur.at(-1)![0]-cur[0][0],cur.at(-1)![1]-cur[0][1])<1e-6;if(ends&&!closed){cur.pop();closed=true;}
     if(closed&&curves>=4&&lines===0){const c:P2=[cur.reduce((a,p)=>a+p[0],0)/cur.length,cur.reduce((a,p)=>a+p[1],0)/cur.length],r=cur.map(p=>Math.hypot(p[0]-c[0],p[1]-c[1])),rm=r.reduce((a,b)=>a+b,0)/r.length;
      if(rm>0&&r.every(v=>Math.abs(v-rm)<=rm*0.02)){ents.push({k:'circle',c,r:rm,layer,h:`p${n++}`});segs+=16;cur=[];curves=lines=0;return;}}
     ents.push({k:'poly',pts:cur,closed:closed&&cur.length>2,layer,h:`p${n++}`});segs+=cur.length-1;}
    cur=[];curves=lines=0;};
   for(let k=0;k<path.length;){const c=path[k++];
    if(c===0){flush(false);cur=[ap(g.t,path[k++],path[k++])];}
    else if(c===1){cur.push(ap(g.t,path[k++],path[k++]));lines++;}
    else if(c===2){k+=4;cur.push(ap(g.t,path[k++],path[k++]));curves++;}
    else if(c===3){k+=2;cur.push(ap(g.t,path[k++],path[k++]));curves++;}
    else if(c===4){const start=cur[0];if(cur.length>1&&start&&Math.hypot(cur.at(-1)![0]-start[0],cur.at(-1)![1]-start[1])<1e-6)cur.pop();flush(true);if(start)cur=[start];}
    else break;}
   flush(false);if(segs>limit)truncated=true;
  }
 }
 for(const it of o.texts||[]){const s=String(it.str||'').replace(/\s+/g,' ').trim();if(!s)continue;const [a,b,c,d,e,f]=it.transform;
  ents.push({k:'text',at:[e,f],text:s,size:Math.hypot(c,d)||Math.hypot(a,b)||it.height||1,rot:Math.atan2(b,a),layer:PDF_TEXT_LAYER,h:`t${n++}`,w:it.width});}
 const d=finish({kind:'pdf',ents,page:{x0:view[0],y0:view[1],w:view[2]-view[0],h:view[3]-view[1]}});
 return {...d,bounds:[view[0],view[1],view[2],view[3]]};
}
/** Entities in floor mm through a similarity (PDF page points → floor, the underlay / calibration), clipped to a window in
 * source units — the PDF import input (DXF uses `docToMm` + the grid origin). */
export function docToFloor(d:CadDoc,t:{scale:number;rotation:number;tx:number;ty:number},win?:[number,number,number,number]):CadEnt[]{
 const c=Math.cos(t.rotation),s=Math.sin(t.rotation),k=t.scale,F=(p:P2):P2=>[k*(c*p[0]-s*p[1])+t.tx,k*(s*p[0]+c*p[1])+t.ty],inW=(p:P2)=>!win||p[0]>=win[0]&&p[0]<=win[2]&&p[1]>=win[1]&&p[1]<=win[3];
 const out:CadEnt[]=[];
 for(const e of d.ents){
  if(e.k==='line'){if(inW(e.a)||inW(e.b))out.push({...e,a:F(e.a),b:F(e.b)});}
  else if(e.k==='poly'){if(e.pts.some(inW))out.push({...e,pts:e.pts.map(F)});}
  else if(e.k==='text'){if(inW(e.at))out.push({...e,at:F(e.at),size:e.size*k,rot:e.rot+t.rotation,...(e.w!==undefined?{w:e.w*k}:{})});}
  else if(e.k==='arc'){if(inW(e.c))out.push({...e,c:F(e.c),r:e.r*k,a0:e.a0+t.rotation,a1:e.a1+t.rotation});}
  else if(inW(e.c))out.push({...e,c:F(e.c),r:e.r*k});
 }
 return out;
}

/** Entities scaled to mm and clipped to a window (source units) — the import input. Texts / circles / polys keep their
 * handles; a polyline is kept when any vertex lies in the window, lines when an end does. */
export function docToMm(d:CadDoc,units:CadUnits,win?:[number,number,number,number]):CadEnt[]{
 const k=UNIT_MM[units],inW=(p:P2)=>!win||p[0]>=win[0]&&p[0]<=win[2]&&p[1]>=win[1]&&p[1]<=win[3],s=(p:P2):P2=>[p[0]*k,p[1]*k];
 const out:CadEnt[]=[];
 for(const e of d.ents){
  if(e.k==='line'){if(inW(e.a)||inW(e.b))out.push({...e,a:s(e.a),b:s(e.b)});}
  else if(e.k==='poly'){if(e.pts.some(inW))out.push({...e,pts:e.pts.map(s)});}
  else if(e.k==='text'){if(inW(e.at))out.push({...e,at:s(e.at),size:e.size*k,...(e.w!==undefined?{w:e.w*k}:{})});}
  else if(inW(e.c))out.push({...e,c:s(e.c),r:e.r*k});
 }
 return out;
}
