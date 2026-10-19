import {lazy,Suspense} from 'react';
import type {ComponentProps} from 'react';
const Files=lazy(()=>import('./Files').then(module=>({default:module.FilePanel})));
export function FilePanel(props:ComponentProps<typeof import('./Files')['FilePanel']>){return <Suspense fallback={<section className="panel padded" role="status">กำลังเปิดแบบอ้างอิง…</section>}><Files {...props}/></Suspense>;}
