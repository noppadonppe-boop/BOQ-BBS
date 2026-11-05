/** Sheet primitives → DXF entities (LINE, LWPOLYLINE, CIRCLE, ELLIPSE, HATCH, TEXT, MTEXT, INSERT + ATTRIB, DIMENSION with
 * its *D block, LEADER, VIEWPORT). Every entity is ByLayer (no colour / linetype / lineweight of its own). */
import {expandPrims,type DimPrim,type LayerRole,type LeaderPrim,type MtextPrim,type PlainPrim,type Prim} from '../../domain/drawingPrims';
import {lineweightCode,type CadStandard} from '../../domain/cadStandard';
import {DxfDoc,type DimStyleDef,type Layout,type Pair} from './writer';

/** sheet (x, y down, mm) → target (x', y' up): x' = ax + x·sc, y' = ay − y·sc */
export type Tf={ax:number;ay:number;sc:number};
export type Editable={dims:boolean;leaders:boolean;mtext:boolean;markBlock:boolean};
export type Stats={entities:Record<string,number>;layers:Set<string>;dims:number;leaders:number;marks:number;mtext:number;viewports:number};
type Block=Parameters<DxfDoc['entity']>[0];
const CAP=.72; // cap height / font size (same factor as the R12 export)

const rgb=(hex:string)=>{const h=hex.replace('#',''),n=h.length===3?h.split('').map(c=>c+c).join(''):h;return [0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255);};
const light=(hex:string)=>{const [r,g,b]=rgb(hex);return .3*r+.59*g+.11*b>.8;};
export const mtextEscape=(t:string)=>t.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}');
/** MTEXT text over 250 characters goes in code 3 chunks, the last part in code 1 */
const mtextPairs=(text:string):Pair[]=>{const ch=[...text],out:Pair[]=[];while(ch.length>250)out.push([3,ch.splice(0,250).join('')]);out.push([1,ch.join('')]);return out;};

export class Emitter{
 readonly stats:Stats={entities:{},layers:new Set(),dims:0,leaders:0,marks:0,mtext:0,viewports:0};
 private markBlock?:string;
 constructor(readonly doc:DxfDoc,readonly cad:CadStandard,readonly edit:Editable){}
 layer(role:LayerRole){const l=this.cad.layers[role];this.doc.layer({name:l.name,aci:l.aci,linetype:l.linetype,lineweight:lineweightCode(l.lineweight),plot:l.plot});this.stats.layers.add(l.name);return l.name;}
 private roleOf(p:Prim):LayerRole{return p.layer||(p.t==='text'||p.t==='mtext'?'text':p.t==='dim'?'dim':p.t==='leader'?'mark':p.view?'concrete':'titleBlock');}
 private add(b:Block,type:string,body:Pair[],role:LayerRole,handle?:string){this.stats.entities[type]=(this.stats.entities[type]||0)+1;return this.doc.entity(b,type,body,{layer:this.layer(role),handle});}
 /** Emits primitives into a block / space through `tf`; `dim` = DIMSTYLE of the dimensions of these primitives. */
 emit(b:Block,prims:Prim[],tf:Tf,dim:DimStyleDef){
  const X=(x:number)=>tf.ax+x*tf.sc,Y=(y:number)=>tf.ay-y*tf.sc;
  for(const p of prims){
   if(p.t==='dim'){if(this.edit.dims)this.dimension(b,p,tf,dim);else this.emit(b,expandPrims([p]),tf,dim);continue;}
   if(p.t==='leader'){if(this.edit.leaders)this.leader(b,p,tf,dim);else this.emit(b,expandPrims([p]),tf,dim);continue;}
   if(p.t==='mtext'){if(this.edit.mtext)this.mtext(b,p,tf);else this.emit(b,expandPrims([p]),tf,dim);continue;}
   this.plain(b,p,X,Y,tf.sc);
  }
 }
 private plain(b:Block,p:PlainPrim,X:(x:number)=>number,Y:(y:number)=>number,sc:number){
  const role=this.roleOf(p);
  if(p.t==='image')return;
  if(p.t==='text'){if(!p.text.trim())return;this.text(b,role,X(p.x),Y(p.y),p.size*CAP*sc,p.text,p.anchor);return;}
  const fill='fill' in p&&p.fill&&p.fill!=='none'&&!light(p.fill)?p.fill:undefined,stroke=p.stroke&&p.stroke!=='none'?p.stroke:undefined;
  const pts=(q:[number,number][])=>q.map(([x,y])=>[X(x),Y(y)] as [number,number]);
  if(p.t==='line'){this.add(b,'LINE',[[100,'AcDbLine'],[10,X(p.x1)],[20,Y(p.y1)],[30,0],[11,X(p.x2)],[21,Y(p.y2)],[31,0]],role);return;}
  if(p.t==='circle'||p.t==='ellipse'){const cx=X(p.cx),cy=Y(p.cy),rx=(p.t==='circle'?p.r:p.rx)*sc,ry=(p.t==='circle'?p.r:p.ry)*sc;
   // filled dots (bar sections, leader dots): solid HATCH; outline drawn when stroked (or the dot has no other edge)
   if(fill&&Math.abs(rx-ry)<1e-9)this.add(b,'HATCH',[[100,'AcDbHatch'],[10,0],[20,0],[30,0],[210,0],[220,0],[230,1],[2,'SOLID'],[70,1],[71,0],[91,1],[92,1],[93,1],[72,2],[10,cx],[20,cy],[40,rx],[50,0],[51,360],[73,1],[97,0],[75,0],[76,1],[98,0]],role);
   if(!stroke&&fill&&Math.abs(rx-ry)<1e-9)return;if(!stroke&&!fill)return;
   if(Math.abs(rx-ry)<1e-9)this.add(b,'CIRCLE',[[100,'AcDbCircle'],[10,cx],[20,cy],[30,0],[40,rx]],role);
   else{const major=rx>=ry;this.add(b,'ELLIPSE',[[100,'AcDbEllipse'],[10,cx],[20,cy],[30,0],[11,major?rx:0],[21,major?0:ry],[31,0],[210,0],[220,0],[230,1],[40,major?ry/rx:rx/ry],[41,0],[42,2*Math.PI]],role);}
   return;}
  const ring=p.t==='rect'?pts([[p.x,p.y],[p.x+p.w,p.y],[p.x+p.w,p.y+p.h],[p.x,p.y+p.h]]):pts(p.pts),closed=p.t==='rect'||p.closed!==false;
  if(ring.length<2)return;
  // small dark fills (legend squares, coupler marks): solid HATCH; big fills (table headers) stay outline only
  const area=Math.abs(ring.reduce((t,[x,y],i)=>{const [u,v]=ring[(i+1)%ring.length];return t+x*v-u*y;},0))/2/(sc*sc);
  if(fill&&closed&&ring.length>2&&area<30)this.add(b,'HATCH',[[100,'AcDbHatch'],[10,0],[20,0],[30,0],[210,0],[220,0],[230,1],[2,'SOLID'],[70,1],[71,0],[91,1],[92,2],[72,0],[73,1],[93,ring.length],...ring.flatMap(([x,y])=>[[10,x],[20,y]] as Pair[]),[97,0],[75,0],[76,1],[98,0]],role);
  if(!stroke&&!fill)return;
  this.add(b,'LWPOLYLINE',[[100,'AcDbPolyline'],[90,ring.length],[70,closed?1:0],[43,0],...ring.flatMap(([x,y])=>[[10,x],[20,y]] as Pair[])],role);
 }
 text(b:Block,role:LayerRole,x:number,y:number,h:number,text:string,anchor?:'start'|'middle'|'end',rot=0){
  const just=anchor==='end'?2:anchor==='middle'?1:0;
  return this.add(b,'TEXT',[[100,'AcDbText'],[10,x],[20,y],[30,0],[40,h],[1,text],...(rot?[[50,rot] as Pair]:[]),[7,'Standard'],...(just?[[72,just],[11,x],[21,y],[31,0]] as Pair[]:[]),[100,'AcDbText']],role);
 }
 private mtext(b:Block,p:MtextPrim,tf:Tf){
  const h=p.size*CAP*tf.sc,x=tf.ax+p.x*tf.sc,y=tf.ay-(p.y-p.size*CAP)*tf.sc,attach=p.anchor==='end'?3:p.anchor==='middle'?2:1;
  this.stats.mtext++;
  this.add(b,'MTEXT',[[100,'AcDbMText'],[10,x],[20,y],[30,0],[40,h],[41,0],[71,attach],[72,1],...mtextPairs(p.lines.map(mtextEscape).join('\\P')),[7,'Standard'],[73,2],[44,Math.max(.25,Math.min(4,p.step*tf.sc/(h*5/3)))]],this.roleOf(p));
 }
 /** Rotated DIMENSION + its anonymous block (lines, ticks / arrows, text, def points), so programs that do not
  * regenerate dimensions still show it right. */
 private dimension(b:Block,p:DimPrim,tf:Tf,d:DimStyleDef){
  const T=(q:[number,number]):[number,number]=>[tf.ax+q[0]*tf.sc,tf.ay-q[1]*tf.sc],A=T(p.a),B=T(p.b),Lp=T(p.line),k=d.dimscale,h=p.dir==='h';
  const measured=h?Math.abs(B[0]-A[0]):Math.abs(B[1]-A[1]);if(measured<1e-9)return;
  const shown=(measured*d.dimlfac).toFixed(d.precision),label=p.text?p.text.replace('<>',shown):shown;
  const blk=this.doc.dimBlock(),add=(type:string,body:Pair[],layer='0')=>this.doc.entity(blk,type,body,{layer});
  const line=(x1:number,y1:number,x2:number,y2:number)=>add('LINE',[[100,'AcDbLine'],[10,x1],[20,y1],[30,0],[11,x2],[21,y2],[31,0]]);
  // dimension line position, extension lines from the features
  const pos=h?Lp[1]:Lp[0],ends:[number,number][]=h?[[A[0],pos],[B[0],pos]]:[[pos,A[1]],[pos,B[1]]];
  [A,B].forEach((F,i)=>{const from=h?F[1]:F[0],dist=pos-from,s=Math.sign(dist);if(Math.abs(dist)<=d.extOffset*k+1e-9)return;
   const a=from+s*d.extOffset*k,z=pos+s*d.extBeyond*k;if(h)line(ends[i][0],a,ends[i][0],z);else line(a,ends[i][1],z,ends[i][1]);});
  line(ends[0][0],ends[0][1],ends[1][0],ends[1][1]);
  const t=.75*k;
  for(const [i,[x,y]] of ends.entries()){
   if(d.arrow==='tick')line(x-t,y-t,x+t,y+t);
   else if(d.arrow==='dot')add('CIRCLE',[[100,'AcDbCircle'],[10,x],[20,y],[30,0],[40,.4*k]]);
   else{const dir=i?-1:1,len=2.5*k,w=len/6;const [px,py]=h?[x+dir*len,y]:[x,y+dir*len*Math.sign(ends[1][1]-ends[0][1])];
    add('SOLID',[[100,'AcDbTrace'],[10,x],[20,y],[30,0],[11,h?px:px-w],[21,h?py-w:py],[31,0],[12,h?px:px+w],[22,h?py+w:py],[32,0],[13,h?px:px+w],[23,h?py+w:py],[33,0]]);}}
  const mid:[number,number]=h?[(ends[0][0]+ends[1][0])/2,pos+d.extOffset*k*.6]:[pos-d.extOffset*k*.6,(ends[0][1]+ends[1][1])/2],th=d.textHeight*k;
  add('MTEXT',[[100,'AcDbMText'],[10,mid[0]],[20,mid[1]],[30,0],[40,th],[41,0],[71,8],[72,1],[1,mtextEscape(label)],[7,'Standard'],...(h?[]:[[50,90] as Pair])]);
  for(const q of [Lp,A,B])add('POINT',[[100,'AcDbPoint'],[10,q[0]],[20,q[1]],[30,0]],'Defpoints');
  const textMid:[number,number]=h?[mid[0],mid[1]+th/2]:[mid[0]-th/2,mid[1]];
  this.stats.dims++;
  this.add(b,'DIMENSION',[[100,'AcDbDimension'],[280,0],[2,blk.name],[3,d.name],[10,ends[1][0]],[20,ends[1][1]],[30,0],[11,textMid[0]],[21,textMid[1]],[31,0],[70,32],[71,5],[42,measured],[1,p.text??''],
   [100,'AcDbAlignedDimension'],[13,A[0]],[23,A[1]],[33,0],[14,B[0]],[24,B[1]],[34,0],[50,h?0:90],[100,'AcDbRotatedDimension']],this.roleOf(p));
 }
 private markDef(){
  if(this.markBlock)return this.markBlock;
  const name=this.cad.mark.blockName,blk=this.doc.block(name,2);this.markBlock=name;
  // LABEL = visible text as drawn; MARK / N / SIZE / SPACING / LAYER = bar data (invisible) for schedules / ATTEXT
  ['LABEL','MARK','N','SIZE','SPACING','LAYER'].forEach((tag,i)=>this.doc.entity(blk,'ATTDEF',[[100,'AcDbText'],[10,0],[20,-i*3],[30,0],[40,2.5],[1,''],[7,'Standard'],[100,'AcDbAttributeDefinition'],[280,0],[3,tag],[2,tag],[70,i?1:0]],{layer:'0'}));
  return name;
 }
 /** LEADER (no arrowhead: the dot at the bar is a solid HATCH) bound to an INSERT of the Mark block whose attributes
  * carry the label and the bar data; without the block option the label is TEXT. */
 private leader(b:Block,p:LeaderPrim,tf:Tf,d:DimStyleDef){
  const T=(q:[number,number]):[number,number]=>[tf.ax+q[0]*tf.sc,tf.ay-q[1]*tf.sc],pts=p.pts.map(T),h=p.size*CAP*tf.sc,[tx,ty]=T(p.at),role=this.roleOf(p);
  if(p.arrow==='dot')for(const q of p.draw)if(q.t==='circle')this.plain(b,{...q,layer:role},x=>tf.ax+x*tf.sc,y=>tf.ay-y*tf.sc,tf.sc);
  const useBlock=this.edit.markBlock&&this.cad.mark.useBlock,ins=useBlock?this.doc.h():undefined;
  this.stats.leaders++;
  if(pts.length>=2)this.add(b,'LEADER',[[100,'AcDbLeader'],[3,d.name],[71,0],[72,0],[73,useBlock?2:3],[74,1],[75,0],[40,0],[41,0],[76,pts.length],...pts.flatMap(([x,y])=>[[10,x],[20,y],[30,0]] as Pair[]),...(ins?[[340,ins] as Pair]:[])],role);
  if(!useBlock||!ins){p.text.forEach((t,i)=>this.text(b,role,tx,ty-i*h*1.6,h,t,p.anchor));return;}
  const name=this.markDef(),just=p.anchor==='end'?2:p.anchor==='middle'?1:0,m=p.mark;
  this.stats.marks++;
  this.add(b,'INSERT',[[100,'AcDbBlockReference'],[66,1],[2,name],[10,tx],[20,ty],[30,0]],role,ins);
  const vals:[string,string][]=[['LABEL',p.text.join(' ')],['MARK',m?.mark||''],['N',m?.n!==undefined?String(m.n):''],['SIZE',m?.size||''],['SPACING',m?.spacing!==undefined?String(m.spacing):''],['LAYER',m?.layer||'']];
  vals.forEach(([tag,v],i)=>this.doc.entity(b,'ATTRIB',[[100,'AcDbText'],[10,tx],[20,ty-i*h*1.4],[30,0],[40,h],[1,v],[7,'Standard'],...(just&&!i?[[72,just],[11,tx],[21,ty],[31,0]] as Pair[]:[]),[100,'AcDbAttribute'],[280,0],[2,tag],[70,i?1:0]],{layer:this.layer(role),owner:ins}));
  this.doc.entity(b,'SEQEND',[],{layer:this.layer(role),owner:ins});
 }
 /** INSERT of a block (uniform scale) */
 insert(b:Block,name:string,x:number,y:number,scale:number,role:LayerRole){return this.add(b,'INSERT',[[100,'AcDbBlockReference'],[2,name],[10,x],[20,y],[30,0],[41,scale],[42,scale],[43,scale]],role);}
 /** Locked paper-space VIEWPORT: `center` / `size` on paper, `view` = model centre, `height` = model height shown. */
 viewport(l:Layout,id:number,center:[number,number],size:[number,number],view:[number,number],height:number){
  this.stats.viewports++;
  this.add(l.block,'VIEWPORT',[[100,'AcDbViewport'],[10,center[0]],[20,center[1]],[30,0],[40,size[0]],[41,size[1]],[68,2],[69,id],[12,view[0]],[22,view[1]],[13,0],[23,0],[14,10],[24,10],[15,10],[25,10],[16,0],[26,0],[36,1],[17,0],[27,0],[37,0],[42,50],[43,0],[44,0],[45,height],[50,0],[51,0],[72,100],[90,16384],[1,''],[281,0],[71,0],[74,0],[110,0],[120,0],[130,0],[111,1],[121,0],[131,0],[112,0],[122,1],[132,0],[79,0],[146,0],[282,0]],'viewport');
 }
}
