import type {exportFile as exportPipeline} from './exports';

// Resolve the full export pipeline only after a user requests an output.
export async function exportFile(...args: Parameters<typeof exportPipeline>) {
  const pipeline = await import('./exports');
  return pipeline.exportFile(...args);
}
