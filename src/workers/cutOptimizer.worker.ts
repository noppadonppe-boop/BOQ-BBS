import {optimize,validateMember} from '../domain/engine';
import {optimizeCuts} from '../domain/cutOptimizer';
import {expandDemand} from '../domain/cutPlanBasis';
self.onmessage=(event:MessageEvent)=>{
 try{const {members,spec,stock,kerf,minOffcut,objective,capturedDemand}=event.data,progress=(p:any)=>self.postMessage({type:'progress',progress:p});let plan;if(capturedDemand)plan=optimizeCuts(expandDemand(capturedDemand),stock,kerf,minOffcut,objective,progress);else{for(const m of members){const errors=validateMember(m,spec);if(errors.length)throw Error(`${m.code}: ${errors[0]}`);}plan=optimize(members,spec,stock,kerf,minOffcut,objective,progress);}self.postMessage({type:'result',plan});}
 catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
