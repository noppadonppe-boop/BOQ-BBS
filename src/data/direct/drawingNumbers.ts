import {collection,getDocs} from 'firebase/firestore';
import {db} from '../firebase';
import type {Member} from '../../domain/model';
import {planDrawingNumbers} from '../../domain/drawingNumbers';
import {decodeStorage} from '../../domain/storageCodec';
import {projectTransaction,recordRef,projectRef,encode,now} from './common';

/** Give every member a BBS drawing number (Prefix-Suffix-BBS-XXXX-Rxxx): new runs for members without one and
 * numbers recomposed after a prefix / suffix change. Only drawingSetup changes, so member status and confirmations stay. */
export async function renumberDirectDrawings(pid:string,data:Record<string,any>,id:string){
 const listed=await getDocs(collection(db,'projects',pid,'members'));
 return projectTransaction('renumberDrawings',pid,data,id,['admin','qs'],async(tx,p)=>{
  const snaps=await Promise.all(listed.docs.map(d=>tx.get(d.ref)));
  const members=snaps.filter(s=>s.exists()).map(s=>decodeStorage(s.data()) as Member);
  const changes=planDrawingNumbers(p,members);
  for(const {member,setup} of changes)tx.set(recordRef(pid,'members',member.id),encode({...member,drawingSetup:setup,version:member.version+1,updatedAt:now()}));
  if(changes.length)tx.update(projectRef(pid),{version:p.version+1});
  return {count:changes.length};
 });
}
