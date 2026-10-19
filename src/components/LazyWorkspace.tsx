import {lazy, Suspense} from 'react';
import type {ComponentProps} from 'react';
import type {MemberEditor as Editor} from './Editors';
import type {Delivery as Drawings} from './Delivery';
import type {BackupRestorePanel as Backup} from './BackupRestorePanel';
import type {ImportedHistory as History} from './ImportedHistory';
import type {CostReport as Costs} from './CostReport';

const EditorPanel = lazy(() => import('./Editors').then(m => ({default: m.MemberEditor})));
const DrawingPanel = lazy(() => import('./Delivery').then(m => ({default: m.Delivery})));
const BackupPanel = lazy(() => import('./BackupRestorePanel').then(m => ({default: m.BackupRestorePanel})));
const HistoryPanel = lazy(() => import('./ImportedHistory').then(m => ({default: m.ImportedHistory})));
const CostPanel = lazy(() => import('./CostReport').then(m => ({default: m.CostReport})));

function Loading({children}: {children: string}) {
  return <section className="panel padded" role="status">{children}</section>;
}

export function MemberEditor(props: ComponentProps<typeof Editor>) {
  return <Suspense fallback={<Loading>กำลังเปิดสมาชิกและ BBS…</Loading>}><EditorPanel {...props}/></Suspense>;
}
export function Delivery(props: ComponentProps<typeof Drawings>) {
  return <Suspense fallback={<Loading>กำลังเปิดแบบส่งงาน…</Loading>}><DrawingPanel {...props}/></Suspense>;
}
export function BackupRestorePanel(props: ComponentProps<typeof Backup>) {
  return <Suspense fallback={<Loading>กำลังเปิดสำรองและกู้คืนข้อมูล…</Loading>}><BackupPanel {...props}/></Suspense>;
}
export function ImportedHistory(props: ComponentProps<typeof History>) {
  return <Suspense fallback={<Loading>กำลังเปิดประวัตินำเข้า…</Loading>}><HistoryPanel {...props}/></Suspense>;
}
export function CostReport(props: ComponentProps<typeof Costs>) {
  return <Suspense fallback={<Loading>กำลังเปิดประมาณราคา BOQ…</Loading>}><CostPanel {...props}/></Suspense>;
}
