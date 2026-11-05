import {byView,grow,modelDim,ntsDim,pad,paperDim,viewTf,type Ctx,type DxfSheet} from './common';

/** Mode C · Model only: each sheet's frame (tables, notes, title block) is a block TTLB-<k> inserted ×N (N = the most used
 * scale of the sheet's views), sheets side by side. Views at 1:N are drawn at true size right on the scaled frame;
 * views at another 1:n are blocks VIEW-<k>-<id> of the true-size view inserted with scale N / n (dimensions inside are
 * measured in the block at true size, style BBS-DIM-1-n). Not-to-scale views are drawn on the frame (DIMLFAC). */
export function layoutC(c:Ctx,sheets:DxfSheet[]){
 let sx=0;
 sheets.forEach((sh,k)=>{
  const groups=byView(sh.prims),ns=sh.views.filter(v=>v.n&&groups.get(v.id)?.length).map(v=>v.n);
  const N=ns.length?ns.reduce((b,n)=>ns.filter(x=>x===n).length>ns.filter(x=>x===b).length?n:b,ns[0]):1;
  if(!k)c.doc.header.ltscale=N;
  const frame=c.doc.block(`TTLB-${pad(k+1)}`,0);c.em.emit(frame,groups.get('')||[],{ax:0,ay:sh.h,sc:1},paperDim(c,1));
  c.em.insert(c.doc.model,frame.name,sx,0,N,'titleBlock');
  const ftf={ax:sx,ay:sh.h*N,sc:N};grow(c,ftf,{x0:0,y0:0,x1:sh.w,y1:sh.h});
  for(const v of sh.views){const prims=groups.get(v.id);if(!prims?.length)continue;
   if(!v.n){c.em.emit(c.doc.model,prims,ftf,ntsDim(c,1/(v.s*N),N));c.warnings.push(`แผ่น ${k+1} · ${v.title}: ไม่ได้ใช้มาตราส่วน (NTS) · ตัวเลขใช้ DIMLFAC`);continue;}
   if(v.n===N){c.em.emit(c.doc.model,prims,ftf,modelDim(c,N));continue;}
   // true-size block, origin at the view origin, inserted where that origin sits on the scaled frame
   const blk=c.doc.block(`VIEW-${pad(k+1)}-${v.id}`,0),[x0,y0]=v.origin.sheet;
   c.em.emit(blk,prims,viewTf(v,-v.origin.model[0],-v.origin.model[1]),modelDim(c,v.n));
   c.em.insert(c.doc.model,blk.name,ftf.ax+x0*N,ftf.ay-y0*N,N/v.n,'concrete');
   c.warnings.push(`แผ่น ${k+1} · ${v.title}: 1:${v.n} ต่างจาก 1:${N} ของกรอบ · ใส่เป็น Block ขยาย ×${(N/v.n).toFixed(3).replace(/\.?0+$/,'')}`);
  }
  sx+=sh.w*N*1.1;
 });
}
