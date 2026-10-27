/**
 * The JSON worker's ops, run in-process, for a `vi.mock('@/lib/jsonFileWorkerUtils', ...)` factory: jsdom
 * and node have no Worker. Spread it over `importOriginal()` so the module's other exports stay.
 */
export async function inlineJsonWorker() {
  const { runJsonFileOp } = await import('@/lib/jsonFileOps');
  return {
    parseWorldFile: (file: Blob) => runJsonFileOp({ op: 'parseWorld', file }),
  };
}
