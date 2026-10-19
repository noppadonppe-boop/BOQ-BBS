import type {Member,Spec,Stock} from '../domain/model';
import type {CutPlan,CuttingObjective,CutProgress} from '../domain/cutOptimizer';
import type {CutDemandRow} from '../domain/cutPlanBasis';
export type CutRunOptions={signal?:AbortSignal;onProgress?:(progress:CutProgress|{phase:'reading'}|{phase:'saving'})=>void};
export const cutAbort=()=>new DOMException('ยกเลิกการคำนวณแผนตัดแล้ว','AbortError');
export function runCutOptimization(input:{members:Member[];spec:Spec;stock:Stock[];kerf:number;minOffcut:number;objective:CuttingObjective;capturedDemand?:CutDemandRow[]},options:CutRunOptions={}):Promise<CutPlan>{
 return new Promise((resolve,reject)=>{
  if(options.signal?.aborted){reject(cutAbort());return;}
  const worker=new Worker(new URL('../workers/cutOptimizer.worker.ts',import.meta.url),{type:'module'});
  let settled=false;const finish=(error?:Error,plan?:CutPlan)=>{if(settled)return;settled=true;clearTimeout(timer);options.signal?.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve(plan!);};
  const abort=()=>finish(cutAbort()),timer=setTimeout(()=>finish(Error('การค้นหาแผนตัดใช้เวลานานเกินไป แบ่งสมาชิกหรือพื้นที่เป็นชุดเล็กลง')),120000);
  options.signal?.addEventListener('abort',abort,{once:true});
  worker.onmessage=event=>{if(event.data.type==='progress')options.onProgress?.(event.data.progress);else if(event.data.type==='result')finish(undefined,event.data.plan);else finish(Error(event.data.message||'คำนวณแผนตัดไม่สำเร็จ'));};
  worker.onerror=()=>finish(Error('ไม่สามารถเปิดตัวคำนวณแผนตัด กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'));worker.onmessageerror=()=>finish(Error('ข้อมูลผลแผนตัดไม่ครบ กรุณาคำนวณใหม่'));
  try{worker.postMessage(input);}catch(error){finish(error instanceof Error?error:Error(String(error)));}
 });
}
