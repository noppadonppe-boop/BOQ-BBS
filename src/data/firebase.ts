import {initializeApp} from 'firebase/app';
import {initializeAuth,browserLocalPersistence,indexedDBLocalPersistence,browserPopupRedirectResolver,connectAuthEmulator} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator} from 'firebase/firestore';
import {getStorage,connectStorageEmulator} from 'firebase/storage';
export const emulator=import.meta.env.VITE_USE_EMULATORS==='true';
const projectId=import.meta.env.VITE_FIREBASE_PROJECT_ID||'my-boq-app';
const app=initializeApp({
 apiKey:import.meta.env.VITE_FIREBASE_API_KEY,
 authDomain:import.meta.env.VITE_FIREBASE_AUTH_DOMAIN||`${projectId}.firebaseapp.com`,
 projectId,
 storageBucket:import.meta.env.VITE_FIREBASE_STORAGE_BUCKET||`${projectId}.appspot.com`,
 messagingSenderId:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
 appId:import.meta.env.VITE_FIREBASE_APP_ID,
});
// Match authService's login persistence at startup in every tab. IndexedDB is
// second so existing getAuth sessions can migrate into localStorage on upgrade.
// The SDK removes the old persisted user after a successful migration.
export const auth=initializeAuth(app,{persistence:[browserLocalPersistence,indexedDBLocalPersistence],popupRedirectResolver:browserPopupRedirectResolver}),db=getFirestore(app),storage=getStorage(app);
function emulatorPort(name:string,fallback:number){const value=import.meta.env[name],port=value?Number(value):fallback;if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid local emulator port: '+name);return port;}
if(emulator){connectAuthEmulator(auth,`http://127.0.0.1:${emulatorPort('VITE_AUTH_EMULATOR_PORT',9099)}`,{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',emulatorPort('VITE_FIRESTORE_EMULATOR_PORT',8080));connectStorageEmulator(storage,'127.0.0.1',emulatorPort('VITE_STORAGE_EMULATOR_PORT',9199));}
import {command as directCommand} from './clientCommands';
export async function command(action:string,projectId:string|undefined,data:Record<string,unknown>={},requestId:string=crypto.randomUUID()):Promise<any>{
 return directCommand(action,projectId,data,requestId);
}
