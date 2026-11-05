// S4a fixtures: a synthetic structural floor plan as DXF (mm / m units, one or two plans, optionally turned 90° in the file)
// and as a vector PDF (jsPDF, A3 at 1:100). Grids A–D (0 · 6,000 · 12,000 · 16,500) × 1–3 (0 · 5,000 · 10,000), beams along X
// B1 300 × 600 on 1 / 2 / 3, along Y B2 250 × 500 on A–D (D offset −75), columns 400 × 400 at every crossing, opening OP-1
// 800 × 600 (crossed) at B +2,000 / 1 +2,000, slab labels S1 in A–C, S2 (t = 120) in C–D. Same floor as `handFloor()`.
import {jsPDF} from 'jspdf';
import {autoPanels,newSlabFloor,retagPanels,type Floor} from '../../src/domain/slabFloor';
import {DEFAULT_OPENING_TRIM,DEFAULT_SLAB_REBAR} from '../../src/domain/slabFloorSchema';

export const GX=[0,6000,12000,16500],GY=[0,5000,10000],XL=['A','B','C','D'],YL=['1','2','3'];
const COL=400,B1={w:300,d:600},B2={w:250,d:500},D_OFF=-75;
export const OPENING={x:8000,y:2000,w:800,h:600};
type Ent={t:'line';a:[number,number];b:[number,number];layer:string;lt?:string}|{t:'poly';pts:[number,number][];layer:string}|{t:'circle';c:[number,number];r:number;layer:string}|{t:'text';at:[number,number];text:string;size:number;rot?:number;layer:string};

/** Plan entities (mm) with the grid origin at `o`; `labels` overrides the slab marks (second plan of a sheet). */
export function planEntities(o:[number,number]=[10000,20000],labels:{s1:string;s2:string}={s1:'S1',s2:'S2 (t=120)'}):Ent[]{
 const out:Ent[]=[],X=(v:number)=>o[0]+v,Y=(v:number)=>o[1]+v,rect=(x0:number,y0:number,x1:number,y1:number,layer:string)=>out.push({t:'poly',pts:[[X(x0),Y(y0)],[X(x1),Y(y0)],[X(x1),Y(y1)],[X(x0),Y(y1)]],layer});
 // text centred on a point (character width 0.7 × height, as the reader assumes)
 const ctext=(cx:number,cy:number,text:string,size:number,layer:string,rot=0)=>{const w=0.7*size*text.length,c=Math.cos(rot),s=Math.sin(rot);out.push({t:'text',at:[X(cx-(c*w/2-s*size/2)),Y(cy-(s*w/2+c*size/2))],text,size,rot:rot*180/Math.PI,layer});};
 GX.forEach((x,k)=>{out.push({t:'line',a:[X(x),Y(-2000)],b:[X(x),Y(12000)],layer:'S-GRID',lt:'CENTER'});out.push({t:'circle',c:[X(x),Y(-2600)],r:400,layer:'S-GRID-BUBBLE'});ctext(x,-2600,XL[k],350,'S-GRID-BUBBLE');});
 GY.forEach((y,k)=>{out.push({t:'line',a:[X(-2000),Y(y)],b:[X(18500),Y(y)],layer:'S-GRID',lt:'CENTER'});out.push({t:'circle',c:[X(-2600),Y(y)],r:400,layer:'S-GRID-BUBBLE'});ctext(-2600,y,YL[k],350,'S-GRID-BUBBLE');});
 for(const x of GX)for(const y of GY)rect(x-COL/2,y-COL/2,x+COL/2,y+COL/2,'S-COL');
 ctext(GX[0]+700,GY[0]+700,'C1',250,'S-COL-TEXT');
 // beams along X: two lines per span between the column faces
 GY.forEach(y=>{for(let i=0;i+1<GX.length;i++){const a=GX[i]+COL/2,b=GX[i+1]-COL/2;for(const s of [-1,1])out.push({t:'line',a:[X(a),Y(y+s*B1.w/2)],b:[X(b),Y(y+s*B1.w/2)],layer:'S-BEAM'});}
  ctext((GX[0]+GX[1])/2,y+B1.w/2+250,'B1 (300x600)',250,'S-BEAM-TEXT');});
 GX.forEach((x,k)=>{const c=x+(k===3?D_OFF:0);for(let j=0;j+1<GY.length;j++){const a=GY[j]+COL/2,b=GY[j+1]-COL/2;for(const s of [-1,1])out.push({t:'line',a:[X(c+s*B2.w/2),Y(a)],b:[X(c+s*B2.w/2),Y(b)],layer:'S-BEAM'});}
  ctext(c-B2.w/2-250,(GY[0]+GY[1])/2,k===3?'B2':k===0?'2B2 250x500':'B2 250x500',250,'S-BEAM-TEXT',Math.PI/2);});
 // opening (outline + cross), label
 const op=OPENING;rect(op.x,op.y,op.x+op.w,op.y+op.h,'S-OPENING');out.push({t:'line',a:[X(op.x),Y(op.y)],b:[X(op.x+op.w),Y(op.y+op.h)],layer:'S-OPENING'},{t:'line',a:[X(op.x+op.w),Y(op.y)],b:[X(op.x),Y(op.y+op.h)],layer:'S-OPENING'});
 ctext(op.x+op.w/2,op.y+op.h+300,'OP-1',200,'S-TEXT');
 // slab labels in the cells (S2 = cells C–D)
 for(let j=0;j+1<GY.length;j++)for(let i=0;i+1<GX.length;i++){const cx=(GX[i]+GX[i+1])/2,cy=(GY[j]+GY[j+1])/2+(i===1&&j===0?1200:0);ctext(cx,cy,i===2?(j===0?labels.s2:labels.s2.replace(/\s*\(.*\)/,'')):labels.s1,300,'S-SLAB-TEXT');}
 // context the reader must ignore: slab edge, title, a dimension-like note
 rect(-150,-150,16650,10150,'S-SLAB');ctext(8000,-4500,'FLOOR PLAN 2ND',500,'S-TEXT');ctext(3000,10800,'6000',200,'S-DIM');
 return out;
}

/** DXF text (AC1009-style tables + entities, LWPOLYLINE) of the plan. `units` mm | m ($INSUNITS 4 | 6, coordinates / 1000 in m),
 * `plans` 2 = a second, different plan 40 m to the right, `turn` = the whole drawing turned +90° about the origin. */
export function slabPlanDxf(o:{units?:'mm'|'m';plans?:1|2;turn?:boolean;insunits?:boolean}={}):string{
 const k=o.units==='m'?1/1000:1,ents=[...planEntities(),...(o.plans===2?planEntities([50000,20000],{s1:'S3',s2:'S3'}):[])];
 const P=(p:[number,number]):[number,number]=>{const q:[number,number]=o.turn?[-p[1],p[0]]:p;return [q[0]*k,q[1]*k];};
 const L:string[]=[];let h=0x100;const g=(c:number,v:string|number)=>L.push(String(c),String(v));const hd=()=>g(5,(h++).toString(16).toUpperCase());
 g(0,'SECTION');g(2,'HEADER');g(9,'$ACADVER');g(1,'AC1015');if(o.insunits!==false){g(9,'$INSUNITS');g(70,o.units==='m'?6:4);}g(0,'ENDSEC');
 const layers:[string,number][]=[['0',7],['S-GRID',1],['S-GRID-BUBBLE',1],['S-COL',4],['S-COL-TEXT',7],['S-BEAM',3],['S-BEAM-TEXT',7],['S-OPENING',6],['S-TEXT',7],['S-SLAB',8],['S-SLAB-TEXT',2],['S-DIM',7]];
 g(0,'SECTION');g(2,'TABLES');
 g(0,'TABLE');g(2,'LTYPE');hd();g(70,2);for(const n of ['CONTINUOUS','CENTER']){g(0,'LTYPE');hd();g(2,n);g(70,0);g(3,n==='CENTER'?'Center ____ _ ____':'Solid');g(72,65);g(73,0);g(40,0);}g(0,'ENDTAB');
 g(0,'TABLE');g(2,'LAYER');hd();g(70,layers.length);for(const [n,c] of layers){g(0,'LAYER');hd();g(2,n);g(70,0);g(62,c);g(6,'CONTINUOUS');}g(0,'ENDTAB');
 g(0,'ENDSEC');
 g(0,'SECTION');g(2,'ENTITIES');
 for(const e of ents){
  if(e.t==='line'){const a=P(e.a),b=P(e.b);g(0,'LINE');hd();g(8,e.layer);if(e.lt)g(6,e.lt);g(10,a[0]);g(20,a[1]);g(30,0);g(11,b[0]);g(21,b[1]);g(31,0);}
  else if(e.t==='poly'){g(0,'LWPOLYLINE');hd();g(8,e.layer);g(90,e.pts.length);g(70,1);for(const p of e.pts.map(P)){g(10,p[0]);g(20,p[1]);}}
  else if(e.t==='circle'){const c=P(e.c);g(0,'CIRCLE');hd();g(8,e.layer);g(10,c[0]);g(20,c[1]);g(30,0);g(40,e.r*k);}
  else{const a=P(e.at);g(0,'TEXT');hd();g(8,e.layer);g(10,a[0]);g(20,a[1]);g(30,0);g(40,e.size*k);g(1,e.text);if(e.rot||o.turn)g(50,(e.rot||0)+(o.turn?90:0));}
 }
 g(0,'ENDSEC');g(0,'EOF');return L.join('\n')+'\n';
}

/** The same floor made by hand (generator inputs of S1 + S3). */
export function handFloor():Floor{
 const f=newSlabFloor();f.gridsX=GX.map((at,k)=>({label:XL[k],at}));f.gridsY=GY.map((at,k)=>({label:YL[k],at}));
 f.beams=[...YL.map((l,k)=>({id:`bx${k+1}`,mark:'B1',along:'X' as const,line:l,from:'A',to:'D',width:B1.w,depth:B1.d})),
  ...XL.map((l,k)=>({id:`by${k+1}`,mark:'B2',along:'Y' as const,line:l,from:'1',to:'3',width:B2.w,depth:B2.d,...(k===3?{offset:D_OFF}:{})}))];
 f.columns=XL.flatMap(x=>YL.map(y=>({id:`c${x}${y}`,x,y,sx:COL,sy:COL})));
 f.marks=[...f.marks,{name:'S2',thickness:120,support:'elevated',rebar:structuredClone(DEFAULT_SLAB_REBAR)}];
 f.panels=autoPanels(f,'S1').map(p=>p.outline.every(q=>q[0]>12000)?{...p,mark:'S2'}:p);
 f.openings=[{id:'op1',label:'OP-1',shape:'rect',...OPENING,trim:structuredClone(DEFAULT_OPENING_TRIM)}];
 return retagPanels(f);
}

/** Vector PDF of the plan: A3 landscape, 1:100, grid A/1 at (60 mm, 230 mm from the top). Returns the bytes. */
export const PDF_ORIGIN_MM:[number,number]=[60,230];
export function slabPlanPdf():Uint8Array{
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a3'}),s=1/100,X=(v:number)=>PDF_ORIGIN_MM[0]+v*s,Y=(v:number)=>PDF_ORIGIN_MM[1]-v*s;
 doc.setLineWidth(0.18);
 for(const e of planEntities([0,0])){
  if(e.t==='line'){doc.line(X(e.a[0]),Y(e.a[1]),X(e.b[0]),Y(e.b[1]));}
  else if(e.t==='poly'){const p=e.pts;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];doc.line(X(p[i][0]),Y(p[i][1]),X(q[0]),Y(q[1]));}}
  else if(e.t==='circle')doc.circle(X(e.c[0]),Y(e.c[1]),e.r*s);
  else{doc.setFontSize(Math.max(4,e.size*s*72/25.4));doc.text(e.text,X(e.at[0]),Y(e.at[1]),{angle:e.rot||0});}
 }
 doc.setFontSize(10);doc.text('SYNTHETIC FLOOR PLAN 1:100 (S4a fixture)',20,285);
 return new Uint8Array(doc.output('arraybuffer'));
}
