// @vitest-environment jsdom
// Must load before importing the service: its singleton constructor opens IndexedDB.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WorldStorageService, { type StoredWorldRecord } from './WorldStorageService';
import { clearDeletedDefaultWorlds, readDeletedDefaultWorlds } from '@/lib/defaultWorlds';
import { encodePlaceholderToken } from '@/lib/placeholders';
import { openWorldLibrary, putWorldRecords } from '@/lib/worldLibrary';
import { WORLD_CHANGE_CHANNEL } from '@/lib/worldChangeSignal';

vi.mock('@/lib/jsonFileWorkerUtils', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...(await (await import('@/test/inlineJsonWorker')).inlineJsonWorker()),
}));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('local world storage (IndexedDB)', () => {
  const validWorld: StoredWorldRecord = {
    id: 'rt-1',
    name: 'Round Trip',
    description: 'd',
    author: 'me',
    thumbnail: '',
    data: {
      worldOverview: { name: 'Round Trip' },
      stats: [],
      locations: [],
      entities: [],
      traits: [],
      statUpdates: [],
    },
  };

  it('rejects worlds missing required fields', async () => {
    // Intentionally invalid (missing data) to exercise the runtime validation path.
    await expect(
      WorldStorageService.storeWorld({ id: 'x', name: 'X' } as unknown as StoredWorldRecord),
    ).rejects.toThrow(/missing required/);
  });

  it('stores, reads back, lists, and deletes a world', async () => {
    await WorldStorageService.storeWorld(validWorld);

    const data = (await WorldStorageService.getWorldData('rt-1')) as { id: string };
    expect(data.id).toBe('rt-1');

    const meta = await WorldStorageService.getWorldMetadata();
    expect(meta.some((m) => m.id === 'rt-1' && m.name === 'Round Trip')).toBe(true);

    await WorldStorageService.deleteWorld('rt-1');
    await expect(WorldStorageService.getWorldData('rt-1')).rejects.toBe('World not found');
  });

  it('heals a legacy remote-URL thumbnail by falling back to the embedded one in metadata', async () => {
    await WorldStorageService.storeWorld({
      ...validWorld,
      id: 'heal-1',
      thumbnail: 'https://workshop.fierylion.com/api/thumbnails/x.jpeg', // legacy cross-origin URL
      data: { ...validWorld.data, worldOverview: { name: 'H', thumbnail: 'data:image/png;base64,AAA' } },
    });

    const meta = await WorldStorageService.getWorldMetadata();
    const stored = meta.find((m) => m.id === 'heal-1');
    expect(stored?.thumbnail).toBe('data:image/png;base64,AAA'); // embedded base64 wins over the URL

    await WorldStorageService.deleteWorld('heal-1');
  });

  it('keeps a base64 thumbnail as-is in metadata', async () => {
    await WorldStorageService.storeWorld({
      ...validWorld,
      id: 'keep-1',
      thumbnail: 'data:image/jpeg;base64,BBB',
      data: { ...validWorld.data, worldOverview: { name: 'K', thumbnail: 'data:image/png;base64,ZZZ' } },
    });

    const meta = await WorldStorageService.getWorldMetadata();
    expect(meta.find((m) => m.id === 'keep-1')?.thumbnail).toBe('data:image/jpeg;base64,BBB');

    await WorldStorageService.deleteWorld('keep-1');
  });

  it('renders placeholder chips in the blurb the library card draws', async () => {
    // The card has no playthrough behind it, so an unrendered chip reaches the player as raw token text.
    const token = encodePlaceholderToken({ id: 'fen', mode: 'world', placementId: 'p1' });
    await WorldStorageService.storeWorld({
      ...validWorld,
      id: 'ph-1',
      description: `Adrift in the ${token}.`,
      data: { ...validWorld.data, placeholders: [{ id: 'fen', name: 'fen', values: ['Sedge Fen'] }] },
    });

    const meta = await WorldStorageService.getWorldMetadata();
    expect(meta.find((m) => m.id === 'ph-1')?.description).toBe('Adrift in the Sedge Fen.');

    await WorldStorageService.deleteWorld('ph-1');
  });

  it('keeps the source fields sticky across a save that omits them', async () => {
    await WorldStorageService.storeWorld({
      ...validWorld,
      id: 'sticky-1',
      sourceId: 'server-abc',
      dirty: false,
      downloadedAt: '2026-01-01T00:00:00.000Z',
      sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
      sourceAuthorId: 'u-publisher',
    });

    // Simulate an editor save: same id, no source fields, just flips dirty.
    await WorldStorageService.storeWorld({ ...validWorld, id: 'sticky-1', dirty: true });

    const meta = await WorldStorageService.getWorldMetadata();
    const stored = meta.find((m) => m.id === 'sticky-1');
    expect(stored?.sourceId).toBe('server-abc');
    expect(stored?.dirty).toBe(true);
    expect(stored?.downloadedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(stored?.sourceUpdatedAt).toBe('2026-01-01T00:00:00.000Z');
    // Whoever published it does not stop being who published it because the reader edited their copy.
    expect(stored?.sourceAuthorId).toBe('u-publisher');

    await WorldStorageService.deleteWorld('sticky-1');
  });

  it('keeps sourceHash sticky across a save that omits it', async () => {
    await WorldStorageService.storeWorld({ ...validWorld, id: 'sticky-2', sourceHash: 'abc123' });
    await WorldStorageService.storeWorld({ ...validWorld, id: 'sticky-2', dirty: true });

    expect((await readRaw('sticky-2'))?.sourceHash).toBe('abc123');

    await WorldStorageService.deleteWorld('sticky-2');
  });

  it('reads a bundled default as unedited until a save marks it edited', async () => {
    await WorldStorageService.storeWorld({ ...validWorld, id: 'bundled-1', sourceHash: 'abc123' });
    expect(await WorldStorageService.isUneditedDefault('bundled-1')).toBe(true);
    await WorldStorageService.storeWorld({ ...validWorld, id: 'bundled-1', dirty: true });
    expect(await WorldStorageService.isUneditedDefault('bundled-1')).toBe(false);

    await WorldStorageService.storeWorld({ ...validWorld, id: 'own-1' });
    expect(await WorldStorageService.isUneditedDefault('own-1')).toBe(false);
    expect(await WorldStorageService.isUneditedDefault('missing')).toBe(false);

    await WorldStorageService.deleteWorld('bundled-1');
    await WorldStorageService.deleteWorld('own-1');
  });

  describe('tells the other tabs', () => {
    let otherTab: BroadcastChannel;
    let heard: unknown[];
    beforeEach(() => {
      heard = [];
      otherTab = new BroadcastChannel(WORLD_CHANGE_CHANNEL);
      otherTab.onmessage = (event) => { heard.push(event.data); };
    });
    afterEach(() => { otherTab.close(); });
    /** Lets messages already posted arrive: posts a marker behind them and waits for it, then drops it. */
    const settle = async () => {
      const marker = new BroadcastChannel(WORLD_CHANGE_CHANNEL);
      marker.postMessage({ worldId: 'marker' });
      marker.close();
      await vi.waitFor(() => expect(heard).toContainEqual({ worldId: 'marker' }));
      heard = heard.filter((message) => (message as { worldId: string }).worldId !== 'marker');
    };

    it('after a stored world is written, and not for a write that fails', async () => {
      await expect(
        WorldStorageService.storeWorld({ id: 'bad', name: 'X' } as unknown as StoredWorldRecord),
      ).rejects.toThrow();
      await WorldStorageService.storeWorld({ ...validWorld, id: 'tell-1' });
      await vi.waitFor(() => expect(heard).toEqual([{ worldId: 'tell-1' }]));
      await WorldStorageService.deleteWorld('tell-1');
    });

    it('after a content rewrite, and not for one that changes nothing', async () => {
      await WorldStorageService.storeWorld({ ...validWorld, id: 'tell-2' });
      await vi.waitFor(() => expect(heard).toHaveLength(1));
      await WorldStorageService.updateWorldContent('tell-2', (data) => data);
      await settle();
      expect(heard).toHaveLength(1);
      await WorldStorageService.updateWorldContent('tell-2', (data) => ({ ...data, stats: [] }));
      await vi.waitFor(() => expect(heard).toEqual([{ worldId: 'tell-2' }, { worldId: 'tell-2' }]));
      await WorldStorageService.deleteWorld('tell-2');
    });

    it('after a whole-record write, as a backup restore makes', async () => {
      await writeRaw({ ...validWorld, id: 'tell-3' });
      await vi.waitFor(() => expect(heard).toEqual([{ worldId: 'tell-3' }]));
      await WorldStorageService.deleteWorld('tell-3');
    });

    it('after a delete, as a delete', async () => {
      await WorldStorageService.storeWorld({ ...validWorld, id: 'tell-4' });
      await WorldStorageService.deleteWorld('tell-4');
      await vi.waitFor(() => expect(heard).toEqual([{ worldId: 'tell-4' }, { worldId: 'tell-4', deleted: true }]));
    });
  });
});

/** Read a stored record straight from IndexedDB — `getWorldMetadata` doesn't expose `sourceHash`. */
const readRaw = (id: string): Promise<StoredWorldRecord | undefined> =>
  new Promise((resolve, reject) => {
    const open = indexedDB.open('worldsDB');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction(['worlds'], 'readonly').objectStore('worlds').get(id);
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { reject(req.error); db.close(); };
    };
  });

/**
 * Patch a stored record in place, bypassing `storeWorld` — its sticky merge would restore the very
 * `sourceHash` these tests need to stale or clear. The metadata goes with it, as every library write does.
 */
const writeRaw = async (record: StoredWorldRecord): Promise<void> => {
  const db = await openWorldLibrary();
  try {
    await putWorldRecords(db, [record]);
  } finally {
    db.close();
  }
};

/**
 * The two reads the main menu waits on before it can draw anything.
 *
 * Both used to pull every stored record out of IndexedDB, which on a real library means deserializing
 * a hundred megabytes of world payload to answer questions that never look at it: how many worlds are
 * there, and are the three bundled ones current. These guards watch the store itself, because the
 * return value is identical either way — only the cost differs, and only the store can see it.
 */
describe('what the launch reads actually touch', () => {
  /** Counts each store method the code under test reaches for, whichever record it asks about. */
  const watchStore = () => ({
    getAll: vi.spyOn(IDBObjectStore.prototype, 'getAll'),
    getAllKeys: vi.spyOn(IDBObjectStore.prototype, 'getAllKeys'),
    get: vi.spyOn(IDBObjectStore.prototype, 'get'),
  });

  afterEach(async () => {
    await WorldStorageService.deleteWorld('rampage').catch(() => {});
    await WorldStorageService.deleteWorld('mine-1').catch(() => {});
  });

  it('reads ids off the key index, without deserializing one record', async () => {
    await writeRaw({ id: 'mine-1', name: 'Mine', data: { worldOverview: {} } } as StoredWorldRecord);
    const store = watchStore();

    const ids = await WorldStorageService.getWorldIds();

    expect(ids).toContain('mine-1');
    // A `getAll().map(w => w.id)` returns the same array and costs the whole library to build it.
    expect(store.getAllKeys).toHaveBeenCalled();
    expect(store.getAll).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
  });

  it('compares the bundled defaults without reading the worlds the player made', async () => {
    await writeRaw({ id: 'mine-1', name: 'Mine', data: { worldOverview: {} } } as StoredWorldRecord);
    const store = watchStore();

    await WorldStorageService.loadDefaultWorlds([{ id: 'rampage', defaultName: 'Rampage' }]);

    expect(store.getAll).not.toHaveBeenCalled();
    const asked = store.get.mock.calls.map(([key]) => key);
    expect(asked).toContain('rampage');
    expect(asked).not.toContain('mine-1');
  });

  it('still seeds a default it has never stored, reading by id', async () => {
    // The narrowed read must not turn "absent" into "present": a missing key returns undefined, and the
    // seed path depends on telling that apart from a stored copy.
    await WorldStorageService.loadDefaultWorlds([{ id: 'rampage', defaultName: 'Rampage' }]);

    expect((await readRaw('rampage'))?.sourceHash).toEqual(expect.any(String));
  });
});

describe('loadDefaultWorlds (content-hash refresh)', () => {
  // The real bundled world, hashed through the real `?raw` glob — the smallest one keeps the parse cheap.
  const seed = [{ id: 'rampage', defaultName: 'Rampage' }];

  afterEach(async () => {
    await WorldStorageService.deleteWorld('rampage').catch(() => {});
  });

  it('seeds a missing world with its content hash, announcing nothing on a first run', async () => {
    const { failed, updated } = await WorldStorageService.loadDefaultWorlds(seed);

    expect(failed).toEqual([]);
    expect(updated).toEqual([]); // a first seed isn't news to the player
    expect((await readRaw('rampage'))?.sourceHash).toEqual(expect.any(String));
  });

  it('does not rewrite an already-converged world (the every-launch re-save loop)', async () => {
    await WorldStorageService.loadDefaultWorlds(seed);

    // A sentinel that only a rewrite would clobber, plus a direct watch on the write path.
    const record = (await readRaw('rampage'))!;
    await writeRaw({ ...record, name: 'SENTINEL' });
    const storeSpy = vi.spyOn(WorldStorageService, 'storeWorld');

    const { updated } = await WorldStorageService.loadDefaultWorlds(seed);

    expect(storeSpy).not.toHaveBeenCalled();
    expect(updated).toEqual([]);
    expect((await readRaw('rampage'))?.name).toBe('SENTINEL');
  });

  it('reseeds and announces when the bundled content changed', async () => {
    await WorldStorageService.loadDefaultWorlds(seed);
    const record = (await readRaw('rampage'))!;
    await writeRaw({ ...record, sourceHash: 'STALE-HASH', name: 'OLD NAME' });

    const { updated } = await WorldStorageService.loadDefaultWorlds(seed);

    expect(updated).toHaveLength(1);
    const healed = await readRaw('rampage');
    expect(healed?.name).not.toBe('OLD NAME'); // bundle content won
    expect(healed?.sourceHash).toBe(record.sourceHash); // hash healed, so the next run converges
  });

  it('backfills a hashless copy silently, then converges', async () => {
    await WorldStorageService.loadDefaultWorlds(seed);
    const record = (await readRaw('rampage'))!;
    delete record.sourceHash; // a world seeded before hashing existed
    await writeRaw(record);

    const first = await WorldStorageService.loadDefaultWorlds(seed);
    expect(first.updated).toEqual([]); // adopting a hash isn't a content change — don't announce it
    expect((await readRaw('rampage'))?.sourceHash).toEqual(expect.any(String));

    const second = await WorldStorageService.loadDefaultWorlds(seed);
    expect(second.updated).toEqual([]);
  });

  it('leaves an edited world alone even when the bundle changed', async () => {
    await WorldStorageService.loadDefaultWorlds(seed);
    const record = (await readRaw('rampage'))!;
    await writeRaw({ ...record, sourceHash: 'STALE-HASH', dirty: true, name: 'MY EDIT' });

    const { updated } = await WorldStorageService.loadDefaultWorlds(seed);

    expect(updated).toEqual([]);
    const stored = await readRaw('rampage');
    expect(stored?.name).toBe('MY EDIT');
    expect(stored?.sourceHash).toBe('STALE-HASH'); // still stale: a later un-edit can still pick the update up
  });

  it('reports a world with no bundled JSON as failed without throwing', async () => {
    const { failed, updated } = await WorldStorageService.loadDefaultWorlds([
      { id: 'no-such-world', defaultName: 'Nope' },
    ]);

    expect(failed).toEqual(['no-such-world']);
    expect(updated).toEqual([]);
  });

  it('keeps the error behind each failed world, named by its id', async () => {
    const { errors } = await WorldStorageService.loadDefaultWorlds([
      { id: 'no-such-world', defaultName: 'Nope' },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('no-such-world');
    expect(errors[0].cause).toBeInstanceOf(Error);
  });
});

describe('default worlds: seed vs. the player deleting one', () => {
  const RAMPAGE = [{ id: 'rampage', defaultName: 'City Rampage' }];

  it('seeds a default that has never been stored', async () => {
    const { failed } = await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    expect(failed).toEqual([]);
    await expect(WorldStorageService.getWorldData('rampage')).resolves.toBeTruthy();
  });

  it('does not re-create a default the player deleted', async () => {
    // The bug: the seeder decides on presence alone, so a deleted default looked "never seeded" and came
    // back on the next Main Menu mount.
    await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    await WorldStorageService.deleteWorld('rampage');

    await WorldStorageService.loadDefaultWorlds(RAMPAGE);

    await expect(WorldStorageService.getWorldData('rampage')).rejects.toBe('World not found');
  });

  it('stops counting a deleted default once it is stored again, as Keep Mine in another tab saves it back', async () => {
    await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    const world = await WorldStorageService.getWorldData('rampage');
    await WorldStorageService.deleteWorld('rampage');
    expect(readDeletedDefaultWorlds().has('rampage')).toBe(true);

    await WorldStorageService.storeWorld({ id: 'rampage', name: 'City Rampage', dirty: true, data: world } as StoredWorldRecord);

    expect(readDeletedDefaultWorlds().has('rampage')).toBe(false);
    await WorldStorageService.deleteWorld('rampage');
  });

  it('leaves a deleted default gone across repeated seed passes', async () => {
    await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    await WorldStorageService.deleteWorld('rampage');
    for (let i = 0; i < 3; i++) await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    await expect(WorldStorageService.getWorldData('rampage')).rejects.toBe('World not found');
  });

  it('still seeds the other defaults after one is deleted', async () => {
    await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    await WorldStorageService.deleteWorld('rampage');

    await WorldStorageService.loadDefaultWorlds([...RAMPAGE, { id: 'drone', defaultName: 'Reincarnated Drone' }]);

    await expect(WorldStorageService.getWorldData('rampage')).rejects.toBe('World not found');
    await expect(WorldStorageService.getWorldData('drone')).resolves.toBeTruthy();
  });

  it('re-seeds a deleted default once the tombstones are cleared (the Restore button)', async () => {
    await WorldStorageService.loadDefaultWorlds(RAMPAGE);
    await WorldStorageService.deleteWorld('rampage');
    await expect(WorldStorageService.getWorldData('rampage')).rejects.toBe('World not found');

    clearDeletedDefaultWorlds();
    await WorldStorageService.loadDefaultWorlds(RAMPAGE);

    await expect(WorldStorageService.getWorldData('rampage')).resolves.toBeTruthy();
  });

  it('does not tombstone a deleted non-default world', async () => {
    await WorldStorageService.storeWorld({
      id: 'uploaded-1', name: 'Mine', description: '', author: '', thumbnail: '',
      data: { worldOverview: { name: 'Mine' }, stats: [], locations: [], entities: [], traits: [], statUpdates: [] },
    } as unknown as StoredWorldRecord);

    await WorldStorageService.deleteWorld('uploaded-1');

    expect(localStorage.getItem('FORMAMORPH_deletedDefaultWorlds')).toBeNull();
  });
});
