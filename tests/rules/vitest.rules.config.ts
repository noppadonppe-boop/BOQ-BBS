// SEC1 rules tests: run against the separate demo emulators started by `npm run test:rules` (firebase emulators:exec).
import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/rules/**/*.emu.ts'],testTimeout:60000,hookTimeout:120000,fileParallelism:false}});
