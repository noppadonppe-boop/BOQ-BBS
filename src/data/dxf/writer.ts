/** Low-level DXF 2018 (AC1032) writer: group codes, automatic handles (5) and owners (330), HEADER, CLASSES, TABLES
 * (VPORT, LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD), BLOCKS, ENTITIES and OBJECTS (root dictionary,
 * ACAD_GROUP, ACAD_LAYOUT + one LAYOUT per sheet, ACAD_MLEADERSTYLE, ACAD_MLINESTYLE, ACAD_PLOTSTYLENAME …).
 * The record layouts follow a file written by ezdxf 1.4 (`ezdxf.new('R2018')`) and the Autodesk DXF reference.
 * Text is UTF-8 as is (DXF 2007+). Units mm ($INSUNITS = 4). */

export type Pair=[number,string|number];
type Block={name:string;record:string;begin:string;end:string;flags:number;layout:string;ents:string[]};
export type Layout={name:string;handle:string;block:Block;mainVp:string;order:number;w:number;h:number};
export type DimStyleDef={name:string;dimscale:number;dimlfac:number;textHeight:number;arrow:'tick'|'closed'|'dot';extOffset:number;extBeyond:number;precision:number};
export type LayerDef={name:string;aci:number;linetype:string;lineweight:number;plot:boolean};
/** linetype patterns (mm, ISO): dash > 0, gap < 0 */
const LINETYPES:Record<string,{desc:string;pattern:number[]}>={HIDDEN2:{desc:'Hidden (.5x) _ _ _ _ _ _ _ _',pattern:[3.175,-1.5875]},DASHED:{desc:'Dashed __ __ __ __',pattern:[12.7,-6.35]},
 CENTER2:{desc:'Center (.5x) ___ _ ___ _ ___',pattern:[19.05,-3.175,3.175,-3.175]}};

const isFloat=(c:number)=>c>=10&&c<=59||c>=110&&c<=149||c>=210&&c<=239||c>=460&&c<=469||c>=1010&&c<=1059;
export function fmtValue(code:number,v:string|number){
 if(typeof v==='string')return v.replace(/[\r\n]+/g,' ');
 if(!Number.isFinite(v))v=0;
 if(isFloat(code)){let s=(Math.abs(v)<1e-9?0:v).toFixed(6).replace(/0+$/,'');if(s.endsWith('.'))s+='0';return s==='-0.0'?'0.0':s;}
 return String(Math.round(v));
}
const ser=(pairs:Pair[])=>pairs.map(([c,v])=>`${c}\r\n${fmtValue(c,v)}`).join('\r\n');

export class DxfDoc{
 private next=0x20;
 readonly h=()=>(this.next++).toString(16).toUpperCase();
 // fixed objects
 private readonly T={vport:this.h(),ltype:this.h(),layer:this.h(),style:this.h(),view:this.h(),ucs:this.h(),appid:this.h(),dimstyle:this.h(),record:this.h()};
 private readonly O={root:this.h(),group:this.h(),layouts:this.h(),mlstyleDict:this.h(),mlstyle:this.h(),mlineDict:this.h(),mline:this.h(),plotDict:this.h(),placeholder:this.h(),
  colorDict:this.h(),materialDict:this.h(),plotSettings:this.h(),scaleDict:this.h(),tableStyleDict:this.h(),visualDict:this.h()};
 private readonly vportRec=this.h();private readonly styleRec=this.h();private readonly appRec=this.h();
 private readonly ltypes=new Map<string,string>();
 private readonly layers=new Map<string,LayerDef&{handle:string}>();
 private readonly dimstyles=new Map<string,DimStyleDef&{handle:string}>();
 private readonly blocks:Block[]=[];
 readonly layouts:Layout[]=[];
 readonly model:Block;readonly paper:Block;
 private anon=0;
 extents={min:[0,0],max:[420,297]};
 header:{ltscale:number}={ltscale:1};
 constructor(readonly font:string){
  for(const n of ['ByBlock','ByLayer','Continuous',...Object.keys(LINETYPES)])this.ltypes.set(n,this.h());
  this.layer({name:'0',aci:7,linetype:'Continuous',lineweight:-3,plot:true});this.layer({name:'Defpoints',aci:7,linetype:'Continuous',lineweight:-3,plot:false});
  this.model=this.block('*Model_Space',0);this.paper=this.block('*Paper_Space',0);
  const ml=this.h();this.model.layout=ml;this.layouts.push({name:'Model',handle:ml,block:this.model,mainVp:'',order:0,w:420,h:297});
 }
 layer(l:LayerDef){if(!this.layers.has(l.name))this.layers.set(l.name,{...l,handle:this.h()});return l.name;}
 hasLayer(name:string){return this.layers.has(name);}
 dimstyle(d:DimStyleDef){if(!this.dimstyles.has(d.name))this.dimstyles.set(d.name,{...d,handle:this.h()});return this.dimstyles.get(d.name)!;}
 dimstyleNames(){return [...this.dimstyles.keys()];}
 blockNames(){return this.blocks.map(b=>b.name);}
 block(name:string,flags:number):Block{const b={name,record:this.h(),begin:this.h(),end:this.h(),flags,layout:'0',ents:[]};this.blocks.push(b);return b;}
 /** anonymous dimension block *D<n> */
 dimBlock(){return this.block(`*D${++this.anon}`,1);}
 /** Paper-space layout (tab). The first one owns *Paper_Space, the next *Paper_Space0, *Paper_Space1 … */
 newLayout(name:string,w:number,h:number):Layout{
  const first=this.layouts.length===1,block=first?this.paper:this.block(`*Paper_Space${this.layouts.length-2}`,0),handle=this.h(),mainVp=this.h();
  block.layout=handle;const l={name,handle,block,mainVp,order:this.layouts.length,w,h};this.layouts.push(l);
  // overall paper viewport (ID 1), as AutoCAD / ezdxf write it
  this.entity(block,'VIEWPORT',[[100,'AcDbViewport'],[10,w/2],[20,h/2],[30,0],[40,w*1.1],[41,h*1.1],[68,1],[69,1],[12,w/2],[22,h/2],[13,0],[23,0],[14,10],[24,10],[15,10],[25,10],[16,0],[26,0],[36,1],[17,0],[27,0],[37,0],[42,50],[43,0],[44,0],[45,h*1.1],[50,0],[51,0],[72,100],[90,557088],[1,''],[281,0],[71,0],[74,0],[110,0],[120,0],[130,0],[111,1],[121,0],[131,0],[112,0],[122,1],[132,0],[79,0],[146,0],[282,0]],{layer:'0',handle:mainVp});
  return l;
 }
 /** Adds an entity to a block / space; returns its handle. `body` starts after the AcDbEntity common part. */
 entity(b:Block,type:string,body:Pair[],o:{layer:string;handle?:string;owner?:string}):string{
  const handle=o.handle||this.h(),paper=b===this.paper||b.name.startsWith('*Paper_Space');
  b.ents.push(ser([[0,type],[5,handle],[330,o.owner||b.record],[100,'AcDbEntity'],...(paper?[[67,1] as Pair]:[]),[8,o.layer],...body]));
  return handle;
 }
 /** raw pairs appended to the last entity (e.g. ATTRIB / SEQEND of an INSERT) */
 raw(b:Block,pairs:Pair[]){b.ents.push(ser(pairs));}
 toString(){
  const out:string[]=[];const S=(p:Pair[])=>out.push(ser(p));
  const tableHead=(name:string,handle:string,count:number,extra:Pair[]=[])=>S([[0,'TABLE'],[2,name],[5,handle],[330,0],[100,'AcDbSymbolTable'],[70,count],...extra]);
  const rec=(type:string,handle:string,owner:string,sub:string,body:Pair[],hc=5)=>S([[0,type],[hc,handle],[330,owner],[100,'AcDbSymbolTableRecord'],[100,sub],...body]);
  // HEADER
  const dimName=this.dimstyles.size?[...this.dimstyles.keys()][0]:'Standard';
  S([[0,'SECTION'],[2,'HEADER'],[9,'$ACADVER'],[1,'AC1032'],[9,'$ACADMAINTVER'],[70,105],[9,'$DWGCODEPAGE'],[3,'ANSI_1252'],[9,'$INSBASE'],[10,0],[20,0],[30,0],
   [9,'$EXTMIN'],[10,this.extents.min[0]],[20,this.extents.min[1]],[30,0],[9,'$EXTMAX'],[10,this.extents.max[0]],[20,this.extents.max[1]],[30,0],
   [9,'$LIMMIN'],[10,0],[20,0],[9,'$LIMMAX'],[10,420],[20,297],[9,'$LTSCALE'],[40,this.header.ltscale],[9,'$TEXTSTYLE'],[7,'Standard'],[9,'$CLAYER'],[8,'0'],
   [9,'$DIMSTYLE'],[2,dimName],[9,'$DIMASSOC'],[280,2],[9,'$LUNITS'],[70,2],[9,'$LUPREC'],[70,0],[9,'$AUNITS'],[70,0],[9,'$HANDSEED'],[5,'__SEED__'],
   [9,'$TILEMODE'],[70,1],[9,'$PSLTSCALE'],[70,1],[9,'$MEASUREMENT'],[70,1],[9,'$INSUNITS'],[70,4],[9,'$LWDISPLAY'],[290,1],[9,'$PROXYGRAPHICS'],[70,1],[0,'ENDSEC']]);
  // CLASSES (objects written below)
  S([[0,'SECTION'],[2,'CLASSES']]);
  for(const [name,cpp,app] of [['ACDBDICTIONARYWDFLT','AcDbDictionaryWithDefault','ObjectDBX Classes'],['MLEADERSTYLE','AcDbMLeaderStyle','ACDB_MLEADERSTYLE_CLASS'],['ACDBPLACEHOLDER','AcDbPlaceHolder','ObjectDBX Classes'],['LAYOUT','AcDbLayout','ObjectDBX Classes']] as const)
   S([[0,'CLASS'],[1,name],[2,cpp],[3,app],[90,name==='MLEADERSTYLE'?4095:0],[91,0],[280,0],[281,0]]);
  S([[0,'ENDSEC'],[0,'SECTION'],[2,'TABLES']]);
  tableHead('VPORT',this.T.vport,1);
  rec('VPORT',this.vportRec,this.T.vport,'AcDbViewportTableRecord',[[2,'*Active'],[70,0],[10,0],[20,0],[11,1],[21,1],[12,(this.extents.min[0]+this.extents.max[0])/2],[22,(this.extents.min[1]+this.extents.max[1])/2],[13,0],[23,0],[14,.5],[24,.5],[15,.5],[25,.5],[16,0],[26,0],[36,1],[17,0],[27,0],[37,0],
   [40,Math.max(10,(this.extents.max[1]-this.extents.min[1])*1.1)],[41,1.6],[42,50],[43,0],[44,0],[50,0],[51,0],[71,0],[72,1000],[73,1],[74,3],[75,0],[76,0],[77,0],[78,0],[281,0],[65,0],[146,0]]);
  S([[0,'ENDTAB']]);
  tableHead('LTYPE',this.T.ltype,this.ltypes.size);
  for(const [name,handle] of this.ltypes){const lt=LINETYPES[name];
   rec('LTYPE',handle,this.T.ltype,'AcDbLinetypeTableRecord',lt?[[2,name],[70,0],[3,lt.desc],[72,65],[73,lt.pattern.length],[40,lt.pattern.reduce((t,v)=>t+Math.abs(v),0)],...lt.pattern.flatMap(v=>[[49,v],[74,0]] as Pair[])]:[[2,name],[70,0],[3,''],[72,65],[73,0],[40,0]]);}
  S([[0,'ENDTAB']]);
  tableHead('LAYER',this.T.layer,this.layers.size);
  for(const l of this.layers.values())rec('LAYER',l.handle,this.T.layer,'AcDbLayerTableRecord',[[2,l.name],[70,0],[62,l.aci],[6,l.linetype],...(l.plot?[]:[[290,0] as Pair]),[370,l.lineweight],[390,this.O.placeholder]]);
  S([[0,'ENDTAB']]);
  tableHead('STYLE',this.T.style,1);
  rec('STYLE',this.styleRec,this.T.style,'AcDbTextStyleTableRecord',[[2,'Standard'],[70,0],[40,0],[41,1],[50,0],[71,0],[42,2.5],[3,this.font],[4,'']]);
  S([[0,'ENDTAB']]);
  tableHead('VIEW',this.T.view,0);S([[0,'ENDTAB']]);
  tableHead('UCS',this.T.ucs,0);S([[0,'ENDTAB']]);
  tableHead('APPID',this.T.appid,1);rec('APPID',this.appRec,this.T.appid,'AcDbRegAppTableRecord',[[2,'ACAD'],[70,0]]);S([[0,'ENDTAB']]);
  const styles=[...this.dimstyles.values()];if(!styles.length)styles.push({name:'Standard',dimscale:1,dimlfac:1,textHeight:2.5,arrow:'closed',extOffset:.625,extBeyond:1.25,precision:0,handle:this.h()});
  tableHead('DIMSTYLE',this.T.dimstyle,styles.length,[[100,'AcDbDimStyleTable']]);
  for(const d of styles){const tick=d.arrow==='tick';
   rec('DIMSTYLE',d.handle,this.T.dimstyle,'AcDbDimStyleTableRecord',[[2,d.name],[70,0],[40,d.dimscale],[41,tick?1.25:2.5],[42,d.extOffset],[43,3.75],[44,d.extBeyond],[45,0],[46,tick?d.extBeyond:0],[47,0],[48,0],[49,2.5],[140,d.textHeight],[141,0],[142,tick?1.25:0],[143,.03937007874],[144,d.dimlfac],[145,0],[146,1],[147,.625],[148,0],
    [69,0],[70,0],[71,0],[72,0],[73,0],[74,0],[75,0],[76,0],[77,1],[78,8],[79,3],[170,0],[171,3],[172,1],[173,0],[174,0],[175,0],[176,0],[177,0],[178,0],[179,2],[271,d.precision],[272,d.precision],[273,2],[274,3],[275,0],[276,0],[277,2],[278,46],[279,0],[280,0],[281,0],[282,0],[283,0],[284,8],[285,0],[286,0],[288,0],[289,3],[290,0],[340,this.styleRec],[371,-2],[372,-2]],105);}
  S([[0,'ENDTAB']]);
  tableHead('BLOCK_RECORD',this.T.record,this.blocks.length);
  for(const b of this.blocks)rec('BLOCK_RECORD',b.record,this.T.record,'AcDbBlockTableRecord',[[2,b.name],[340,b.layout],[70,0],[280,1],[281,0]]);
  S([[0,'ENDTAB'],[0,'ENDSEC'],[0,'SECTION'],[2,'BLOCKS']]);
  for(const b of this.blocks){const paper=b.name.startsWith('*Paper_Space');
   S([[0,'BLOCK'],[5,b.begin],[330,b.record],[100,'AcDbEntity'],...(paper?[[67,1] as Pair]:[]),[8,'0'],[100,'AcDbBlockBegin'],[2,b.name],[70,b.flags],[10,0],[20,0],[30,0],[3,b.name],[1,'']]);
   if(b!==this.model&&b!==this.paper)out.push(...b.ents);
   S([[0,'ENDBLK'],[5,b.end],[330,b.record],[100,'AcDbEntity'],...(paper?[[67,1] as Pair]:[]),[8,'0'],[100,'AcDbBlockEnd']]);}
  S([[0,'ENDSEC'],[0,'SECTION'],[2,'ENTITIES']]);out.push(...this.model.ents,...this.paper.ents);S([[0,'ENDSEC']]);
  // OBJECTS
  const O=this.O,dict=(handle:string,owner:string,entries:[string,string][],hard=1)=>S([[0,'DICTIONARY'],[5,handle],[330,owner],[100,'AcDbDictionary'],[281,hard],...entries.flatMap(([k,v])=>[[3,k],[350,v]] as Pair[])]);
  S([[0,'SECTION'],[2,'OBJECTS']]);
  dict(O.root,'0',[['ACAD_COLOR',O.colorDict],['ACAD_GROUP',O.group],['ACAD_LAYOUT',O.layouts],['ACAD_MATERIAL',O.materialDict],['ACAD_MLEADERSTYLE',O.mlstyleDict],['ACAD_MLINESTYLE',O.mlineDict],['ACAD_PLOTSETTINGS',O.plotSettings],['ACAD_PLOTSTYLENAME',O.plotDict],['ACAD_SCALELIST',O.scaleDict],['ACAD_TABLESTYLE',O.tableStyleDict],['ACAD_VISUALSTYLE',O.visualDict]]);
  dict(O.colorDict,O.root,[]);dict(O.group,O.root,[]);dict(O.layouts,O.root,this.layouts.map(l=>[l.name,l.handle]));dict(O.materialDict,O.root,[]);
  dict(O.mlstyleDict,O.root,[['Standard',O.mlstyle]]);dict(O.mlineDict,O.root,[['Standard',O.mline]]);dict(O.plotSettings,O.root,[]);
  S([[0,'ACDBDICTIONARYWDFLT'],[5,O.plotDict],[330,O.root],[100,'AcDbDictionary'],[281,1],[3,'Normal'],[350,O.placeholder],[100,'AcDbDictionaryWithDefault'],[340,O.placeholder]]);
  S([[0,'ACDBPLACEHOLDER'],[5,O.placeholder],[330,O.plotDict]]);
  dict(O.scaleDict,O.root,[]);dict(O.tableStyleDict,O.root,[]);dict(O.visualDict,O.root,[]);
  S([[0,'MLINESTYLE'],[5,O.mline],[102,'{ACAD_REACTORS'],[330,O.mlineDict],[102,'}'],[330,O.mlineDict],[100,'AcDbMlineStyle'],[2,'Standard'],[70,0],[3,''],[62,256],[51,90],[52,90],[71,2],[49,.5],[62,256],[6,'BYLAYER'],[49,-.5],[62,256],[6,'BYLAYER']]);
  S([[0,'MLEADERSTYLE'],[5,O.mlstyle],[102,'{ACAD_REACTORS'],[330,O.mlstyleDict],[102,'}'],[330,O.mlstyleDict],[100,'AcDbMLeaderStyle'],[179,2],[170,2],[171,1],[172,0],[90,2],[40,0],[41,0],[173,1],[91,-1056964608],[92,-2],[290,1],[42,2],[291,1],[43,8],[3,'Standard'],[44,4],[300,''],[342,this.styleRec],[174,1],[175,1],[176,0],[178,1],[93,-1056964608],[45,4],[292,0],[297,0],[46,4],[94,-1056964608],[47,1],[49,1],[140,1],[294,1],[141,0],[177,0],[142,1],[295,0],[296,0],[143,3.75],[271,0],[272,9],[273,9]]);
  for(const l of this.layouts){const model=l.order===0;
   S([[0,'LAYOUT'],[5,l.handle],[330,O.layouts],[100,'AcDbPlotSettings'],[1,''],[4,l.w>500?'ISO_A2_(594.00_x_420.00_MM)':'ISO_A3_(420.00_x_297.00_MM)'],[6,''],[40,0],[41,0],[42,0],[43,0],[44,l.w],[45,l.h],[46,0],[47,0],[48,0],[49,0],[140,0],[141,0],[142,1],[143,1],
    [70,model?1024:672],[72,1],[73,0],[74,5],[7,''],[75,16],[76,0],[77,2],[78,300],[147,1],[148,0],[149,0],[100,'AcDbLayout'],[1,l.name],[70,1],[71,l.order],[10,0],[20,0],[11,l.w],[21,l.h],[12,0],[22,0],[32,0],
    [14,1e20],[24,1e20],[34,1e20],[15,-1e20],[25,-1e20],[35,-1e20],[146,0],[13,0],[23,0],[33,0],[16,1],[26,0],[36,0],[17,0],[27,1],[37,0],[76,1],[330,l.block.record],...(l.mainVp?[[331,l.mainVp] as Pair]:[])]);}
  S([[0,'ENDSEC'],[0,'EOF']]);
  return out.join('\r\n').replace('__SEED__',(this.next+1).toString(16).toUpperCase())+'\r\n';
 }
}
