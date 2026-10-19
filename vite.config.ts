import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{port:5173,strictPort:true,watch:{ignored:['**/.emulator-data/**','**/firebase-export-*/**','**/output/**','**/tmp/**']}},build:{chunkSizeWarningLimit:1500},test:{include:['tests/**/*.test.ts']}});
