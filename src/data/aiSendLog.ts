import {collection,getDocs,limit,orderBy,query} from 'firebase/firestore';
import {db} from './firebase';
import {decodeStorage} from '../domain/storageCodec';
import type {AiSendLogEntry} from '../domain/aiSlabPlan';

/** The last sends of drawings to the AI for a project (append-only records `projects/{pid}/aiSendLog`). */
export async function readAiSendLog(pid:string,n=20):Promise<AiSendLogEntry[]>{
 const s=await getDocs(query(collection(db,'projects',pid,'aiSendLog'),orderBy('at','desc'),limit(n)));
 return s.docs.map(d=>decodeStorage(d.data()) as AiSendLogEntry);
}
