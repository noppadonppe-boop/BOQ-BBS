import type {Prim} from '../domain/drawingPrims';

/** Sheet primitives (mm, y down) → AutoCAD R12 DXF (mm, y up). Pages sit side by side with a 20 mm gap.
 * Colours map to the nearest AutoCAD Colour Index; dashed strokes use linetype DASHED; Mark primitives go on
 * layer MARK-<id>, text on TEXT, the rest on SHEET. Non-ASCII text (Thai / Chinese) is written as \U+XXXX. */
export function primsDxf(pages:Prim[][],size:{w:number;h:number},font='tahoma.ttf'){
 const out:string[]=[],g=(code:number,value:string|number)=>out.push(String(code),typeof value==='number'?num(value):value);
 g(0,'SECTION');g(2,'HEADER');g(9,'$ACADVER');g(1,'AC1009');g(9,'$INSUNITS');g(70,4);g(9,'$EXTMIN');g(10,0);g(20,0);g(9,'$EXTMAX');g(10,pages.length*(size.w+20));g(20,size.h);g(0,'ENDSEC');
 g(0,'SECTION');g(2,'TABLES');g(0,'TABLE');g(2,'LTYPE');g(70,2);
 g(0,'LTYPE');g(2,'CONTINUOUS');g(70,0);g(3,'Solid line');g(72,65);g(73,0);g(40,0);
 g(0,'LTYPE');g(2,'DASHED');g(70,0);g(3,'Dashed __ __');g(72,65);g(73,2);g(40,3);g(49,2);g(49,-1);
 g(0,'ENDTAB');
 // text style font that has the sheet's script (AutoCAD's default txt.shx has no Thai / Chinese glyphs)
 g(0,'TABLE');g(2,'STYLE');g(70,1);g(0,'STYLE');g(2,'STANDARD');g(70,0);g(40,0);g(41,1);g(50,0);g(71,0);g(42,2.5);g(3,font);g(4,'');g(0,'ENDTAB');g(0,'ENDSEC');
 g(0,'SECTION');g(2,'ENTITIES');
 pages.forEach((prims,page)=>{
  const ox=page*(size.w+20),X=(x:number)=>x+ox,Y=(y:number)=>size.h-y;
  const head=(type:string,p:Prim,color:number,dashed=false)=>{g(0,type);g(8,layer(p));if(dashed)g(6,'DASHED');g(62,color);};
  const poly=(p:Prim,pts:[number,number][],closed:boolean,color:number,dashed:boolean)=>{if(pts.length<2)return;head('POLYLINE',p,color,dashed);g(66,1);g(10,0);g(20,0);g(30,0);g(70,closed?1:0);
   for(const [x,y] of pts){g(0,'VERTEX');g(8,layer(p));g(10,X(x));g(20,Y(y));g(30,0);}g(0,'SEQEND');g(8,layer(p));};
  for(const p of prims){
   if(p.t==='image')continue;
   if(p.t==='text'){if(!p.text.trim())continue;const just=p.anchor==='end'?2:p.anchor==='middle'?1:0;head('TEXT',p,aci(p.color||'#253b42'));
    g(10,X(p.x));g(20,Y(p.y));g(30,0);g(40,p.size*.72);g(1,encode(p.text));if(just){g(72,just);g(11,X(p.x));g(21,Y(p.y));g(31,0);}continue;}
   // stroked outline; fill-only shapes (bar dots, markers) keep an outline in their fill colour unless the fill is a light background
   const stroke=p.stroke&&p.stroke!=='none'?p.stroke:'fill' in p&&p.fill&&p.fill!=='none'&&!light(p.fill)?p.fill:undefined;
   if(!stroke)continue;const c=aci(stroke),dashed=!!p.dash?.length;
   if(p.t==='line'){head('LINE',p,c,dashed);g(10,X(p.x1));g(20,Y(p.y1));g(30,0);g(11,X(p.x2));g(21,Y(p.y2));g(31,0);}
   else if(p.t==='rect')poly(p,[[p.x,p.y],[p.x+p.w,p.y],[p.x+p.w,p.y+p.h],[p.x,p.y+p.h]],true,c,dashed);
   else if(p.t==='poly')poly(p,p.pts,p.closed!==false,c,dashed);
   else if(p.t==='circle'){head('CIRCLE',p,c,dashed);g(10,X(p.cx));g(20,Y(p.cy));g(30,0);g(40,p.r);}
   else poly(p,Array.from({length:48},(_,i)=>{const a=i/48*2*Math.PI;return [p.cx+p.rx*Math.cos(a),p.cy+p.ry*Math.sin(a)] as [number,number];}),true,c,dashed);
  }
 });
 g(0,'ENDSEC');g(0,'EOF');
 return out.join('\r\n')+'\r\n';
}
const num=(v:number)=>Number.isInteger(v)?String(v):v.toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
const layer=(p:Prim)=>p.t==='text'?'TEXT':p.group?`MARK-${p.group.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,60)}`:'SHEET';
const encode=(t:string)=>[...t].map(ch=>{const c=ch.codePointAt(0)!;return c<128?ch:c<0x10000?`\\U+${c.toString(16).toUpperCase().padStart(4,'0')}`:'?';}).join('');
const rgb=(hex:string)=>{const h=hex.replace('#',''),n=h.length===3?h.split('').map(c=>c+c).join(''):h;return [0,2,4].map(i=>parseInt(n.slice(i,i+2),16)/255);};
const light=(hex:string)=>{const [r,g,b]=rgb(hex);return .3*r+.59*g+.11*b>.8;};
/** Nearest AutoCAD Colour Index: greys → 7 / 8 / 9, saturated colours → hue family. */
function aci(hex:string){
 const [r,g,b]=rgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,s=max-min;
 if(s<.18)return l>.75?9:l>.45?8:7;
 const h=(max===r?((g-b)/s+6)%6:max===g?(b-r)/s+2:(r-g)/s+4)*60;
 return h<15||h>=345?1:h<40?30:h<70?2:h<160?3:h<200?4:h<260?5:h<300?6:6;
}
