// Source file types (no imports: used by the model schema and by source rules without import cycles).
/** CAD / BIM source files (AutoCAD DWG, DXF, IFC from Revit / Tekla): kept as references, not drawn on or read by the drawing AI. */
export const modelFileTypes=['image/vnd.dwg','image/vnd.dxf','application/x-step'] as const;
export const drawingFileTypes=['application/pdf','image/png','image/jpeg'] as const;
export const isModelFile=(a:{contentType:string})=>(modelFileTypes as readonly string[]).includes(a.contentType);
/** File extension → stored content type (browsers give no type for .dwg / .dxf / .ifc). */
export const sourceTypeOf=(name:string,type:string):string|undefined=>{
 const ext=name.toLowerCase().split('.').pop()||'';
 return ({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',dwg:'image/vnd.dwg',dxf:'image/vnd.dxf',ifc:'application/x-step'} as Record<string,string>)[ext]
  ||((drawingFileTypes as readonly string[]).includes(type)?type:undefined);
};
export const modelFileLabel=(contentType:string)=>({'image/vnd.dwg':'AutoCAD DWG','image/vnd.dxf':'DXF','application/x-step':'IFC'} as Record<string,string>)[contentType]||contentType;
