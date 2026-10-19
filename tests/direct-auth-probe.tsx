import {createRoot} from 'react-dom/client';
import {useEffect} from 'react';
import {AuthProvider,useAuth} from '../src/auth/AuthContext';
let captured:(()=>Promise<unknown>)|undefined;
function Capture(){const c=useAuth();useEffect(()=>{if(!c.loading&&!c.firebaseUser&&!captured)captured=c.refreshProfile;},[c]);return null;}
export function start(){const el=document.createElement('div');el.hidden=true;document.body.appendChild(el);createRoot(el).render(<AuthProvider><Capture/></AuthProvider>);}
export const ready=()=>!!captured;
export const refreshBeforeLogin=()=>captured!();
