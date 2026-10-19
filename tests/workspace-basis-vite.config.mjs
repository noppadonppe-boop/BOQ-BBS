import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
const stub=path.resolve('tests/workspace-basis-store.ts');
export default defineConfig({plugins:[react()],resolve:{alias:[{find:'firebase/firestore',replacement:stub},{find:/^\.\/firebase$/,replacement:stub},{find:/^\.\/projectReadback$/,replacement:stub}]},optimizeDeps:{entries:['tests/workspace-basis-harness.html']},cacheDir:'tmp/workspace-basis-vite-cache',server:{host:'127.0.0.1',port:5280,strictPort:true,watch:{ignored:['**/output/**']}}});
