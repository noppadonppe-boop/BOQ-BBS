import {rebarInterference} from '../domain/rebarInterference';
self.onmessage=(event:MessageEvent)=>{try{self.postMessage({result:rebarInterference(event.data.member)});}catch(e){self.postMessage({error:e instanceof Error?e.message:'ตรวจแนวเหล็กไม่สำเร็จ'});}};
