import {build} from 'esbuild';
await build({entryPoints:['src/domain/aiGatewayExports.ts'],bundle:true,platform:'node',format:'cjs',target:'node22',outfile:'functions/lib/model-tools.cjs'});
await build({entryPoints:['tools/ai/mcp.ts'],bundle:true,platform:'node',format:'esm',target:'node22',outfile:'dist/mcp/model-server.mjs'});
