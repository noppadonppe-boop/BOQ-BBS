import {describe,it,expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const {frameRulesStdout}=createRequire(import.meta.url)('../tmp/composer-backend/rules-stdout-framing.cjs');
describe('test-only Storage Rules transport framing (no Rules decision substitution)',()=>{
 it('delivers each coalesced reply unchanged',()=>{const s=frameRulesStdout(new EventEmitter()),received:string[]=[];s.on('data',(b:Buffer)=>received.push(b.toString()));s.emit('data',Buffer.from('{"result":{"permit":false},"id":35}\n{"action":"fetch_firestore_document","server_request_id":36}\n'));expect(received.map(JSON.parse)).toEqual([{result:{permit:false},id:35},{action:'fetch_firestore_document',server_request_id:36}]);});
 it('keeps fragmented Unicode and only emits complete frames',()=>{const s=frameRulesStdout(new EventEmitter()),received:string[]=[];s.on('data',(b:Buffer)=>received.push(b.toString()));const bytes=Buffer.from('{"message":"ทดสอบ"}\n');for(const byte of bytes)s.emit('data',Buffer.from([byte]));expect(received).toEqual(['{"message":"ทดสอบ"}']);});
 it('preserves a final unterminated response and unrelated events',()=>{const s=frameRulesStdout(new EventEmitter()),received:string[]=[];let ended=false;s.on('data',(b:Buffer)=>received.push(b.toString()));s.on('end',()=>ended=true);s.emit('data',Buffer.from('{"id":9}'));expect(received).toEqual([]);s.emit('end');expect(received).toEqual(['{"id":9}']);expect(ended).toBe(true);});
});
