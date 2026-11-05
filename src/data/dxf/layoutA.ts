import {byView,grow,bbox,ntsDim,paperDim,type Ctx,type DxfSheet} from './common';

/** Mode A · sheet coordinates: every page in model space as on the PDF (pages side by side, 20 mm apart, y up).
 * Dimensions are real DIMENSIONs: style BBS-DIM-1-n of the view has DIMLFAC = n, so the number shows the real length. */
export function layoutA(c:Ctx,sheets:DxfSheet[]){
 let ox=0;
 for(const sh of sheets){
  const tf={ax:ox,ay:sh.h,sc:1},groups=byView(sh.prims);
  for(const [id,prims] of groups){const v=sh.views.find(q=>q.id===id);
   c.em.emit(c.doc.model,prims,tf,!v?paperDim(c,1):v.n?paperDim(c,v.n):ntsDim(c,1/v.s));}
  grow(c,tf,bbox(sh.prims)||{x0:0,y0:0,x1:sh.w,y1:sh.h});
  ox+=sh.w+20;
 }
}
