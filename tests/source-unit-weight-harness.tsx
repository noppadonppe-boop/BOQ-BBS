import React from 'react';
import {createRoot} from 'react-dom/client';
import {SourceUnitWeights} from '../src/components/SourceUnitWeights';
import {compareSourceSchedule} from '../src/domain/sourceSchedule';
import {blankMember,currentStarterSpec} from '../src/domain/model';
import '../src/styles.css';
const member=blankMember('Column','UI-ONLY-QA');member.sourceSchedule={version:1,attachmentId:'NONE',sha256:'a'.repeat(64),page:1,basis:'perElement',note:'Synthetic UI check; no file attached, no persistence or engineering approval',rows:[{id:'R1',mark:'ZERO',diameter:12,grade:'SD40',count:2,cutLength:800,unitWeight:0,weight:1.4,note:''},{id:'R2',mark:'MISSING',diameter:12,grade:'SD40',count:2,cutLength:800,note:''}]};
function Harness(){return <main style={{padding:16,maxWidth:1440}}><SourceUnitWeights result={compareSourceSchedule(member,[],[])!}/></main>}
createRoot(document.getElementById('root')!).render(<Harness/>);
