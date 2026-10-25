import type {IfcSpatial} from '../domain/wbsImport';

const value=(v:any)=>v&&typeof v==='object'&&'value' in v?v.value:v;
/** IFC spatial structure: IfcBuilding → IfcBuildingStorey (via IfcRelAggregates), storey elevation in mm. */
export async function readIfcSpatial(file:Blob):Promise<IfcSpatial>{
 const WebIFC=await import('web-ifc'),{default:wasmUrl}=await import('web-ifc/web-ifc.wasm?url');
 const api=new WebIFC.IfcAPI();await api.Init(()=>wasmUrl,true);
 const model=api.OpenModel(new Uint8Array(await file.arrayBuffer()));
 try{
  const ids=(type:number)=>{const v=api.GetLineIDsWithType(model,type),out:number[]=[];for(let i=0;i<v.size();i++)out.push(v.get(i));return out;};
  const line=(id:number)=>{try{return api.GetLine(model,id) as any;}catch{return undefined;}};
  // length unit of the project (IfcSIUnit LENGTHUNIT: METRE + prefix) → mm factor
  let toMm=1000;
  for(const id of ids(WebIFC.IFCSIUNIT)){const u=line(id);if(String(value(u?.UnitType))!=='LENGTHUNIT')continue;const p=String(value(u?.Prefix)||'');toMm=p==='MILLI'?1:p==='CENTI'?10:p==='DECI'?100:p==='KILO'?1e6:1000;break;}
  const children=new Map<number,number[]>();
  for(const id of ids(WebIFC.IFCRELAGGREGATES)){const r=line(id),parent=value(r?.RelatingObject);if(!parent)continue;children.set(parent,[...(children.get(parent)||[]),...(r.RelatedObjects||[]).map(value)]);}
  const storeyIds=new Set(ids(WebIFC.IFCBUILDINGSTOREY)),placed=new Set<number>();
  const buildings=ids(WebIFC.IFCBUILDING).map(id=>{
   const b=line(id),storeys=(children.get(id)||[]).filter(s=>storeyIds.has(s)).map(s=>{placed.add(s);const st=line(s);return {guid:String(value(st?.GlobalId)||''),name:String(value(st?.Name)||''),longName:String(value(st?.LongName)||''),elevation:Number(value(st?.Elevation))*toMm||0};});
   return {guid:String(value(b?.GlobalId)||''),name:String(value(b?.Name)||''),longName:String(value(b?.LongName)||''),storeys};
  });
  // storeys not under a building (badly nested files): one extra building
  const loose=[...storeyIds].filter(s=>!placed.has(s)).map(s=>{const st=line(s);return {guid:String(value(st?.GlobalId)||''),name:String(value(st?.Name)||''),longName:String(value(st?.LongName)||''),elevation:Number(value(st?.Elevation))*toMm||0};});
  if(loose.length)buildings.push({guid:'',name:buildings.length?'IFC':'A',longName:'ชั้นจาก IFC',storeys:loose});
  if(!buildings.length)throw Error('ไฟล์ IFC ไม่มี IfcBuilding / IfcBuildingStorey');
  return {buildings};
 }finally{api.CloseModel(model);}
}
