import type {Prim} from './drawingPrims';
import {beamGroupLayout,beamZoneLabels,type BeamInput,type BeamZone,type ElementInput} from './elementInput';
import {buildView,type ViewRow} from './elementViews';
import type {Member} from './model';

type Box={x:number;y:number;w:number;h:number};
type ViewSpec={axes:[number,number];normal?:number;cut?:number};
export type BeamSection={letter:string;mark:string;zone:BeamZone;x:number};
const groupOf=(input?:ElementInput):BeamInput|undefined=>input?.category==='Beam'&&input.layout==='group'&&input.spans.length?input:undefined;
const SECTIONS_PER_PAGE=5;

/** Cross-sections of a beam group as on the beam details: per beam mark its END / MID / CON / CANT sections
 * (each cut once, where it first occurs: support sections at L/8 from the face, MID at mid-span). */
export function beamGroupSections(input:BeamInput):BeamSection[]{
 const lay=beamGroupLayout(input),out:BeamSection[]=[],seen=new Set<string>();
 const add=(mark:string,zone:BeamZone,x:number)=>{const key=`${mark}|${zone}`;if(seen.has(key))return;seen.add(key);out.push({letter:'',mark,zone,x});};
 for(const s of lay.spans){const near=s.clear/8;
  if(s.kind==='cantilever'){add(s.mark,'cant',(s.a+s.b)/2);continue;}
  add(s.mark,s.zoneA,s.a+near);add(s.mark,'mid',(s.a+s.b)/2);add(s.mark,s.zoneB,s.b-near);}
 const order:Record<BeamZone,number>={end:0,mid:1,con:2,cant:3};
 return out.sort((a,b)=>a.mark.localeCompare(b.mark,'en',{numeric:true})||order[a.zone]-order[b.zone]).map((v,i)=>({...v,letter:i<26?String.fromCharCode(65+i):`A${i-25}`}));
}
/** Extra sheet pages needed for the beam-group sections (the BBS table may need more). */
export function beamSheetPages(input?:ElementInput){const g=groupOf(input);return g?Math.ceil(beamGroupSections(g).length/SECTIONS_PER_PAGE):1;}

/** Left-area layout of an A3 sheet for a beam group: elevation (whole group, section marks), a row of
 * cross-sections for this page and the notes box. Returns undefined for other members. */
export function beamGroupSheet(m:Member,rows:ViewRow[],input:ElementInput|undefined,area:Box,page:number,k:number){
 const g=groupOf(input);if(!g)return undefined;
 const lay=beamGroupLayout(g),all=beamGroupSections(g),pages=Math.ceil(all.length/SECTIONS_PER_PAGE),list=all.slice((page%pages)*SECTIONS_PER_PAGE,(page%pages+1)*SECTIONS_PER_PAGE);
 const elevH=Math.min(110,area.h*.38),secY=area.y+elevH+3,secH=Math.min(78,area.h*.3),secW=(area.w-(SECTIONS_PER_PAGE-1)*2)/SECTIONS_PER_PAGE;
 const elevBox={x:area.x,y:area.y,w:area.w,h:elevH},elevSpec:ViewSpec={axes:[0,2],normal:1,cut:lay.W/2};
 const views:{title:string;box:Box;spec:ViewSpec}[]=[{title:`รูปด้านคาน (ELEVATION) · ${[...new Set(g.spans.map(s=>s.mark))].join(', ')} · ${g.spans.length} ช่วง`,box:elevBox,spec:elevSpec},
  ...list.map((c,i)=>({title:`ตัด ${c.letter}-${c.letter} · ${c.mark} (${beamZoneLabels[c.zone]} SPAN)`,box:{x:area.x+i*(secW+2),y:secY,w:secW,h:secH},spec:{axes:[1,2] as [number,number],normal:0,cut:c.x}}))];
 // section marks on the elevation: same mapping as renderView (box inset by the title band)
 const v=buildView(m,rows,input,elevSpec),b={x:elevBox.x,y:elevBox.y+4,w:elevBox.w,h:elevBox.h-4},M=48*k,spanU=v.u[1]-v.u[0],spanV=v.v[1]-v.v[0];
 const sc=Math.min((b.w-2*M)/spanU,(b.h-2*M)/spanV),offU=(b.w-2*M-spanU*sc)/2,offV=(b.h-2*M-spanV*sc)/2;
 const X=(x:number)=>b.x+M+offU+(x-v.u[0])*sc,Y=(z:number)=>b.y+b.h-M-offV-(z-v.v[0])*sc,marks:Prim[]=[];
 for(const c of all){const x=X(c.x),y0=Y(lay.H)-3,y1=Y(0)+3,on=list.includes(c),color=on?'#c2410c':'#7c8b8f';
  marks.push({t:'line',x1:x,y1:y0,x2:x,y2:y1,stroke:color,width:.25,dash:[2,1,.5,1]},{t:'text',x,y:y0-.8,text:c.letter,size:2.4,color,anchor:'middle',bold:on},{t:'text',x,y:y1+2.6,text:c.letter,size:2.4,color,anchor:'middle',bold:on});}
 // grid bubbles under the elevation
 lay.grid.forEach((gx,i)=>{const lbl=g.grids[i]?.label;if(!lbl)return;const x=X(gx),y=Math.min(b.y+b.h-2.6,Y(0)+6.5);marks.push({t:'circle',cx:x,cy:y,r:2.2,stroke:'#4a5a66',width:.2},{t:'text',x,y:y+.9,text:lbl,size:2.3,color:'#22393f',anchor:'middle'});});
 const notesY=secY+secH+3;
 return {views,marks,notes:{x:area.x,y:notesY,w:area.w,h:area.y+area.h-notesY},pages,sectionPage:`${page%pages+1}/${pages}`};
}
