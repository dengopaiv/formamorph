// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { jsonParts, runJsonFileOp } from './jsonFileOps';
import { APP_VERSION, migrateWorld } from './version';
import { LEGACY_VRM_ID } from './legacyVrm';
import type { World } from '@/types';

describe('runJsonFileOp', () => {
  // Multi-byte characters and a data URL: the content a real world carries, and where a character count
  // and a byte count part ways.
  const content = { name: 'Café 🐸', thumbnail: 'data:image/webp;base64,AAAA', nested: { list: [1, 2] } };

  it('serializes to a Blob with the requested spacing and type', async () => {
    const blob = runJsonFileOp({ op: 'serialize', value: { a: 1 }, space: 2, mime: 'text/plain' }) as Blob;
    expect(blob.type).toBe('text/plain');
    // jsdom's Blob has no `.text()`.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe('{\n  "a": 1\n}');
  });

  it('serializes in parts to the same compact text', async () => {
    const blob = runJsonFileOp({ op: 'serialize', value: content, splitDepth: 2 }) as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe(JSON.stringify(content));
  });

  it('parses text', () => {
    expect(runJsonFileOp({ op: 'parse', text: '{"a":[1]}' })).toEqual({ a: [1] });
  });
});

describe('parseWorld', () => {
  // A v1.2 file: the player VRM is a bare data URL at the root, and nothing is version stamped.
  const legacy = { worldOverview: { name: 'Café 🐸' }, customPlayerVRM: 'data:application/octet-stream;base64,AAAA', stats: [] };
  const fileOf = (text: string) => new Blob([text]);

  it('parses and migrates a file to what the main thread would build', async () => {
    const text = JSON.stringify(legacy);
    const world = (await runJsonFileOp({ op: 'parseWorld', file: fileOf(text) })) as World;

    // The migration mints a fresh id for the default dictionary it adds, so that id is the one difference.
    const fixed = (w: World) => ({ ...w, dictionaries: w.dictionaries?.map((d) => ({ ...d, id: 'fixed' })) });
    expect(fixed(world)).toEqual(fixed(migrateWorld(JSON.parse(text))));
    expect(world.version).toBe(APP_VERSION);
    expect(world.worldOverview.vrmStore?.[LEGACY_VRM_ID]?.file).toEqual({ data: legacy.customPlayerVRM, type: 'model/vrm' });
  });

  it('rejects a file that is not JSON', async () => {
    await expect(runJsonFileOp({ op: 'parseWorld', file: fileOf('{"worldOverview":') })).rejects.toThrow();
  });
});

describe('jsonParts', () => {
  const tricky = {
    name: 'Café 🐸 "quoted"',
    skip: undefined,
    fn: () => 1,
    when: new Date(0),
    list: [1, undefined, () => 1, { deep: [null, true] }],
    // eslint-disable-next-line no-sparse-arrays
    sparse: [1, , 3],
    empty: { inner: [] },
  };

  it.each([0, 1, 2, 3, 10])('joins to JSON.stringify at depth %i', (depth) => {
    expect(jsonParts(tricky, depth).join('')).toBe(JSON.stringify(tricky));
  });

  it('writes each record below the split depth as its own part', () => {
    const records = [{ id: 'a', data: 'x'.repeat(50) }, { id: 'b', data: 'y'.repeat(50) }];
    const parts = jsonParts({ data: { worlds: records } }, 3);
    expect(parts).toContain(JSON.stringify(records[0]));
    expect(parts).toContain(JSON.stringify(records[1]));
    expect(Math.max(...parts.map((p) => p.length))).toBe(JSON.stringify(records[0]).length);
  });
});
