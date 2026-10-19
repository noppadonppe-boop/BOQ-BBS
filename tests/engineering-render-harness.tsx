// Test page only. Record reads are mocked by the Playwright test; no production
// route or authentication replacement is added to the application.
import React from 'react';
import {createRoot} from 'react-dom/client';
import EngineeringFixtures from '../src/components/EngineeringFixtures';
import '../src/styles.css';
const d=(window as any).__fixtureData;
if(!d)throw Error('Rendering test data was not supplied');
createRoot(document.getElementById('root')!).render(<main className="page-content"><p className="notice">UI RENDER TEST ONLY — records mocked; no Firebase persistence or engineering approval</p><EngineeringFixtures project={d.project} members={[d.f.member]} attachments={[]} roles={['viewer']} run={async(f:()=>Promise<unknown>)=>f()}/></main>);
