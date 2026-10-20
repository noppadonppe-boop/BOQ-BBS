/** Renderer-agnostic drawing primitives. The same list is drawn as SVG (screen
 * preview) and with jsPDF (A3 sheet), so both outputs always match. Units are the
 * caller's (px on screen, mm on sheets). `group` tags primitives of one bar Mark. */
type Stroke={stroke?:string;width?:number;dash?:number[]};
export type Prim=
 |({t:'line';x1:number;y1:number;x2:number;y2:number;cap?:'round'}&Stroke&{group?:string})
 |({t:'rect';x:number;y:number;w:number;h:number;fill?:string}&Stroke&{group?:string})
 |({t:'poly';pts:[number,number][];fill?:string;closed?:boolean}&Stroke&{group?:string})
 |({t:'circle';cx:number;cy:number;r:number;fill?:string}&Stroke&{group?:string})
 |({t:'ellipse';cx:number;cy:number;rx:number;ry:number;fill?:string}&Stroke&{group?:string})
 |{t:'image';x:number;y:number;w:number;h:number;src:string;group?:string}
 |{t:'text';x:number;y:number;text:string;size:number;color?:string;anchor?:'start'|'middle'|'end';bold?:boolean;halo?:boolean;group?:string};
/** Approximate text width (units of `size`): Thai combining marks take no width. */
export function textWidth(text:string,size:number){let n=0;for(const ch of text){const c=ch.codePointAt(0)!;if(c===0x0e31||(c>=0x0e34&&c<=0x0e3a)||(c>=0x0e47&&c<=0x0e4e))continue;n+=c<128?(/[A-Z0-9]/.test(ch)?.62:.52):.58;}return n*size;}
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
