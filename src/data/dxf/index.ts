/** DXF 2018 export of BBS drawing sheets (editable: DIMENSION, LEADER + Mark block, MTEXT, ByLayer S-* layers).
 * Modes: B = model 1:1 + one Layout per sheet with viewports (default), C = model only (frame block ×N),
 * A = sheet coordinates as on the PDF. The old R12 writer stays in `../primsDxf.ts`. See docs/DXF_EXPORT.md. */
import {defaultCadStandard,type CadStandard} from '../../domain/cadStandard';
import {DxfDoc} from './writer';
import {Emitter,type Editable} from './entities';
import type {Ctx,DxfSheet} from './common';
import {layoutA} from './layoutA';
import {layoutB} from './layoutB';
import {layoutC} from './layoutC';

export type {DxfSheet} from './common';
export type DxfMode='B'|'C'|'A';
export type DxfOptions={mode:DxfMode;cad?:CadStandard;font?:string;edit?:Partial<Editable>};
export type DxfSummary={layouts:number;viewports:number;dimstyles:string[];dims:number;leaders:number;marks:number;mtext:number;blocks:string[];layers:string[];entities:Record<string,number>;warnings:string[]};

export function buildBbsDxf(sheets:DxfSheet[],o:DxfOptions):{text:string;summary:DxfSummary}{
 const cad=o.cad||defaultCadStandard(),doc=new DxfDoc(o.font||cad.text.font),edit:Editable={dims:true,leaders:true,mtext:true,markBlock:true,...o.edit};
 const c:Ctx={doc,em:new Emitter(doc,cad,edit),cad,warnings:[],ext:{x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity}};
 // every layer of the standard is in the file (empty ones too), so the drawing can be continued on them
 for(const r of Object.keys(cad.layers) as (keyof CadStandard['layers'])[])c.em.layer(r);
 (o.mode==='A'?layoutA:o.mode==='C'?layoutC:layoutB)(c,sheets);
 // AutoCAD expects at least one paper layout: an empty Layout1 in the model-only modes
 if(o.mode!=='B')doc.newLayout('Layout1',sheets[0]?.w||420,sheets[0]?.h||297);
 if(Number.isFinite(c.ext.x0))doc.extents={min:[c.ext.x0,c.ext.y0],max:[c.ext.x1,c.ext.y1]};
 const s=c.em.stats,text=doc.toString();
 return {text,summary:{layouts:o.mode==='B'?doc.layouts.length-1:0,viewports:s.viewports,dimstyles:doc.dimstyleNames(),dims:s.dims,leaders:s.leaders,marks:s.marks,mtext:s.mtext,
  blocks:doc.blockNames().filter(n=>!n.startsWith('*')),
  layers:[...s.layers],entities:s.entities,warnings:[...new Set(c.warnings)]}};
}
/** DXF text of the sheets (see `buildBbsDxf`). */
export function exportBbsDxf(sheets:DxfSheet[],o:DxfOptions):string{return buildBbsDxf(sheets,o).text;}
