/** Renderer-agnostic drawing primitives. The same list is drawn as SVG (screen
 * preview) and with jsPDF (A3 sheet), so both outputs always match. Units are the
 * caller's (px on screen, mm on sheets). `group` tags primitives of one bar Mark. */
type Stroke={stroke?:string;width?:number;dash?:number[]};
/** CAD layer role of a primitive (DXF export: `cadStandard.ts` maps each role to a layer name / colour / linetype). */
export type LayerRole='concrete'|'concreteHidden'|'barMain'|'barBottom'|'barTop'|'barLink'|'barRef'|'dim'|'mark'|'text'|'symbol'|'titleBlock'|'viewport';
export const layerRoles:LayerRole[]=['concrete','concreteHidden','barMain','barBottom','barTop','barLink','barRef','dim','mark','text','symbol','titleBlock','viewport'];
/** `layer` = CAD layer role, `view` = id of the sheet view the primitive belongs to (absent = paper: tables, title block),
 * `key` = stable id of the annotation it draws (Drawing Edit overrides, `drawingEdits.ts`: mark:… / dim:… / user:…). */
type Meta={group?:string;layer?:LayerRole;view?:string;key?:string};
type Pt=[number,number];
export type Prim=
 |({t:'line';x1:number;y1:number;x2:number;y2:number;cap?:'round'}&Stroke&Meta)
 |({t:'rect';x:number;y:number;w:number;h:number;fill?:string}&Stroke&Meta)
 |({t:'poly';pts:[number,number][];fill?:string;closed?:boolean}&Stroke&Meta)
 |({t:'circle';cx:number;cy:number;r:number;fill?:string}&Stroke&Meta)
 |({t:'ellipse';cx:number;cy:number;rx:number;ry:number;fill?:string}&Stroke&Meta)
 |({t:'image';x:number;y:number;w:number;h:number;src:string}&Meta)
 |({t:'text';x:number;y:number;text:string;size:number;color?:string;anchor?:'start'|'middle'|'end';bold?:boolean;halo?:boolean}&Meta)
 |SemanticPrim;
/** Semantic primitives keep what a CAD object needs (DXF DIMENSION / LEADER + block / MTEXT) plus `draw`: the exact
 * plain primitives the SVG / PDF draw (`expandPrims`), so both outputs stay identical to the drawing before.
 * A dimension chain puts the whole chain's drawing on its first segment (`draw` of the others is empty). */
export type DimPrim={t:'dim';kind:'linear';a:Pt;b:Pt;line:Pt;dir:'h'|'v';
 /** real length (mm) */ value:number;
 /** text as drawn (DXF: '<>' = measured value, absent = measured value) */ text?:string;color?:string;size:number;draw:PlainPrim[]}&Meta;
export type LeaderPrim={t:'leader';
 /** first point = arrow / dot at the bar, last = beside the text */ pts:Pt[];text:string[];
 /** text insertion (baseline of the first line) */ at:Pt;anchor?:'start'|'middle'|'end';
 mark?:{mark:string;n?:number;size?:string;spacing?:number;layer?:string};arrow:'dot'|'closed'|'tick'|'none';color?:string;size:number;bold?:boolean;draw:PlainPrim[]}&Meta;
export type MtextPrim={t:'mtext';
 /** baseline of the first line */ x:number;y:number;w?:number;lines:string[];size:number;step:number;anchor?:'start'|'middle'|'end';color?:string;bold?:boolean;draw:PlainPrim[]}&Meta;
export type SemanticPrim=DimPrim|LeaderPrim|MtextPrim;
export type PlainPrim=Exclude<Prim,SemanticPrim>;
export const isSemantic=(p:Prim):p is SemanticPrim=>p.t==='dim'||p.t==='leader'||p.t==='mtext';
/** Plain primitives (line / poly / circle / text …) exactly as the SVG / PDF draw them. Plain lists come back unchanged. */
export function expandPrims(prims:Prim[]):PlainPrim[]{
 if(!prims.some(isSemantic))return prims as PlainPrim[];
 const out:PlainPrim[]=[];for(const p of prims){if(!isSemantic(p)){out.push(p);continue;}for(const q0 of p.draw){const q=q0.layer||!p.layer?(q0.view||!p.view?q0:{...q0,view:p.view}):{...q0,layer:p.layer,...(p.view?{view:p.view}:{})};out.push(p.key&&!q.key?{...q,key:p.key}:q);}}
 return out;
}
/** Same primitive with every text (also inside semantic primitives and their drawing) passed through `f`. */
export function mapPrimText(p:Prim,f:(t:string)=>string):Prim{
 if(p.t==='text')return {...p,text:f(p.text)};
 if(p.t==='dim')return {...p,text:p.text===undefined?undefined:f(p.text),draw:p.draw.map(q=>mapPrimText(q,f) as PlainPrim)};
 if(p.t==='leader')return {...p,text:p.text.map(f),draw:p.draw.map(q=>mapPrimText(q,f) as PlainPrim)};
 if(p.t==='mtext')return {...p,lines:p.lines.map(f),draw:p.draw.map(q=>mapPrimText(q,f) as PlainPrim)};
 return p;
}
/** Tags primitives (and the drawing of semantic ones) with a layer role / view id where they have none. */
export function tagPrims<T extends Prim>(prims:T[],tag:{layer?:LayerRole;view?:string}):T[]{
 for(const p of prims){if(tag.layer&&!p.layer)p.layer=tag.layer;if(tag.view&&!p.view)p.view=tag.view;}
 return prims;
}
/** Approximate text width (units of `size`): Thai combining marks take no width. */
export function textWidth(text:string,size:number){let n=0;for(const ch of text){const c=ch.codePointAt(0)!;if(c===0x0e31||(c>=0x0e34&&c<=0x0e3a)||(c>=0x0e47&&c<=0x0e4e))continue;n+=c<128?(/[A-Z0-9]/.test(ch)?.62:.52):c>=0x2e80?1:.58;}return n*size;}
/** Greedy line wrap with the same width estimate for SVG and PDF. */
export function wrapText(text:string,size:number,width:number,maxLines=3){
 const words=text.split(/(\s+)/),lines:string[]=[];let cur='';
 for(const w of words){const next=cur+w;if(textWidth(next,size)<=width||!cur.trim()){cur=next;continue;}lines.push(cur.trim());cur=w.trimStart();}
 if(cur.trim())lines.push(cur.trim());
 // Break over-long single words (Thai has no spaces).
 const out:string[]=[];for(const l of lines){let rest=l;while(textWidth(rest,size)>width&&rest.length>1){let k=rest.length;while(k>1&&textWidth(rest.slice(0,k),size)>width)k--;out.push(rest.slice(0,k));rest=rest.slice(k);}out.push(rest);}
 if(out.length>maxLines){const kept=out.slice(0,maxLines);kept[maxLines-1]=kept[maxLines-1].replace(/.{0,1}$/,'…');return kept;}
 return out;
}
