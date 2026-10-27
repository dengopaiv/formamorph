import { toast } from 'react-toastify';
import { promisifyRequest, transactionDone, writeAfterRead } from '@/lib/idb';
import {
  WORLD_META_STORE, WORLD_STORE, deleteWorldRecord, libraryTransaction, listFieldsOf, openWorldLibrary,
  putWorldRecord, readAllWorldMeta, readWorldMeta, type LinkedCopy, type WorldMetaRecord,
} from '@/lib/worldLibrary';
import { contentHash } from '@/lib/contentHash';
import { announceWorldDeleted, announceWorldSaved } from '@/lib/worldChangeSignal';
import {
  forgetDeletedDefaultWorld, readDeletedDefaultWorlds, seedWorldData, tombstoneDefaultWorld, type DefaultWorldSeed,
} from '@/lib/defaultWorlds';
import type { WorldMetadata } from '@/types';

/** The toast shown while another tab on an older build holds the library upgrade back. */
const LIBRARY_BLOCKED_TOAST = 'world-library-upgrade-blocked';
export const LIBRARY_BLOCKED_MESSAGE = 'Your world library is waiting to update. Close other Formamorph tabs to finish.';

/** A locally-stored world record (metadata + nested world `data`). Inner fields stay loose since
 *  they round-trip through IndexedDB/JSON and aren't read field-by-field here. */
export interface StoredWorldRecord {
  id: string;
  name: string;
  description?: string;
  author?: string;
  thumbnail?: string;
  /** Server `_id` of the community world this was downloaded from, if any. Local-only wrapper field:
   *  never part of `data`, so it isn't published or exported with the world content. Sticky: it
   *  survives edits (storeWorld preserves it) so the download link persists; only delete removes it. */
  sourceId?: string;
  /** Whether this download has been edited locally and so diverges from its source (git-dirty model).
   *  Set true on an editor save, reset false on (re)download. Local-only, like `sourceId`. */
  dirty?: boolean;
  /** Wall-clock time of the user's most recent editor save. Unset until the first edit, so a never-edited
   *  world has no edited date. Sticky across non-edit stores; local-only. */
  editedAt?: string;
  /** Wall-clock time this copy was (re)downloaded. Sticky across edits; local-only. */
  downloadedAt?: string;
  /** The server world's `updated_at` captured at (re)download — i.e. the source version we hold.
   *  Compared against the server's live `updated_at` to detect refresh vs update. Sticky; local-only. */
  sourceUpdatedAt?: string;
  /** The account that published the listing this copy came from, captured at (re)download. Lets the
   *  author line open their profile — the authored `author` string is free text and names nobody in
   *  particular, while this is exactly who put it on Community Creations. Sticky; local-only. */
  sourceAuthorId?: string;
  /** Bundled defaults only: a hash of the bundle's raw JSON this copy was seeded from, so a later launch can
   *  tell whether the shipped content actually changed. Derived (never hand-written) and local-only, so it
   *  isn't exported and needs no version bump. Absent on copies seeded before hashing existed. */
  sourceHash?: string;
  data: {
    version?: string; // stamped on save/export (see lib/version)
    worldOverview: unknown;
    stats: unknown[];
    statGroups?: unknown[];
    locations: unknown[];
    entities: unknown[];
    entityGroups?: unknown[];
    traits: unknown[];
    traitGroups?: unknown[];
    statUpdates: unknown[];
    dictionary?: unknown[]; // legacy v1.2.0 flat form (read-only; folded to `dictionaries` on load)
    dictionaries?: unknown[]; // v2.x books
    placeholders?: unknown[]; // v2.x author-defined variables/wildcards
    placeholderGroups?: unknown[]; // editor folders over the shared placeholders
  };
}


/** Result of a default-world seed/update pass: ids that failed to load, the error behind each (named by
 *  its id, the caught error as its cause), and display names that were auto-updated in place (so the
 *  caller can notify the player). */
export interface DefaultWorldSyncResult {
  failed: string[];
  errors: Error[];
  updated: string[];
}

/** Singleton owning local world persistence (the world library in `@/lib/worldLibrary`). Default-exported as one
 *  shared instance. */
class WorldStorageService {
  db: IDBDatabase | null;
  private opening: Promise<void> | null = null;

  constructor() {
    this.db = null;
    // No eager open: every operation awaits `ensureInitialized` first, so opening here only adds an
    // import-time IndexedDB touch — which throws an unhandled rejection in test files that import this
    // module without a fake IndexedDB. Lazy init matches ModelStorageService.
  }

  /** Open the IndexedDB connection (idempotent — no-op once `db` is set). */
  async initialize() {
    if (this.db) return;
    let blocked = false;
    this.opening ??= openWorldLibrary(() => {
      blocked = true;
      toast.info(LIBRARY_BLOCKED_MESSAGE, { toastId: LIBRARY_BLOCKED_TOAST, autoClose: false });
    }).then((db) => {
      db.addEventListener('versionchange', () => { if (this.db === db) this.db = null; });
      this.db = db;
    }).finally(() => {
      this.opening = null;
      if (blocked) toast.dismiss(LIBRARY_BLOCKED_TOAST);
    });
    await this.opening;
  }

  /** Lazily open the DB if not yet connected; awaited at the top of every store operation. */
  async ensureInitialized() {
    if (!this.db) {
      await this.initialize();
    }
  }

  /**
   * Every stored world's id, and nothing else.
   *
   * `getAllKeys` reads the key index, so no record is deserialized — the library's whole payload stays
   * on disc. That is what lets the menu draw its real tile layout before a single world is loaded, and
   * it is how a caller that only needs a count should ask for one.
   */
  async getWorldIds(): Promise<string[]> {
    await this.ensureInitialized();
    const transaction = this.db!.transaction([WORLD_STORE], 'readonly');
    const keys = await promisifyRequest(transaction.objectStore(WORLD_STORE).getAllKeys());
    return keys.map(String);
  }

  /** Every metadata record, read from the metadata store alone. */
  private async readMeta(): Promise<WorldMetaRecord[]> {
    await this.ensureInitialized();
    return readAllWorldMeta(this.db!);
  }

  /** One world's metadata record, or undefined when it is not stored. */
  private async readMetaOf(worldId: string): Promise<WorldMetaRecord | undefined> {
    await this.ensureInitialized();
    return readWorldMeta(this.db!, worldId);
  }

  /** List all stored worlds' list fields, for menu/library rendering. Reads no world data. */
  async getWorldMetadata(): Promise<WorldMetadata[]> {
    return (await this.readMeta()).map(listFieldsOf);
  }

  /**
   * Whether a stored world is a bundled default that no save has edited, so it still takes bundled updates.
   *
   * @param worldId - The local record's id
   */
  async isUneditedDefault(worldId: string): Promise<boolean> {
    const meta = await this.readMetaOf(worldId);
    return meta?.sourceHash !== undefined && !meta.dirty;
  }

  /**
   * The local worlds holding a copy that follows `libraryId`.
   *
   * This is what a component's Compatible Worlds section is derived from. `sourceId` is the world's own
   * listing, and a world without one has no published identity to offer the component for.
   *
   * @param libraryId - The library item the copies follow
   * @returns One entry per world, in stored order
   */
  async worldsLinking(libraryId: string): Promise<{ id: string; name: string; sourceId?: string }[]> {
    if (!libraryId) return [];
    return (await this.readMeta())
      .filter((meta) => meta.linkedCopies.some((copy) => copy.link.libraryId === libraryId))
      .map((meta) => ({ id: meta.id, name: meta.name, ...(meta.sourceId ? { sourceId: meta.sourceId } : {}) }));
  }

  /**
   * Every stored copy that follows `libraryId`, with the world holding it.
   *
   * One row per copy rather than per world: a world may hold the same library item twice, and two copies
   * can be in different states. The copy's own content is not read — the update review asks for that per
   * world, only for the worlds the player acts on.
   *
   * @param libraryId - The library item the copies follow
   * @returns One row per copy, in stored world order
   */
  async linkedCopies(libraryId: string): Promise<(LinkedCopy & { worldId: string; worldName: string })[]> {
    if (!libraryId) return [];
    return (await this.readMeta()).flatMap((meta) => meta.linkedCopies
      .filter((copy) => copy.link.libraryId === libraryId)
      .map((copy) => ({ worldId: meta.id, worldName: meta.name, ...copy })));
  }

  /**
   * Rewrite one stored world's content in place.
   *
   * `revise` receives the world's `data` and returns what replaces it. Everything outside `data` is left
   * exactly as it stands — the download link, the edited stamp, the record's own name and thumbnail, and
   * `lastAccessed` too, because a write the player never opened the world for is not an access. That is
   * what `storeWorld` cannot do: it takes a whole record and writes every wrapper field from it.
   *
   * `revise` runs inside the write transaction, so it must be synchronous. Returning the same reference
   * writes nothing.
   *
   * @param worldId - The world to rewrite
   * @param revise - The new content, from the stored content
   */
  async updateWorldContent(
    worldId: string, revise: (data: Record<string, unknown>) => Record<string, unknown>,
  ): Promise<void> {
    await this.ensureInitialized();
    if (!worldId) throw new Error('World ID is required');

    const transaction = libraryTransaction(this.db!, 'readwrite');
    let wrote = false;
    await writeAfterRead(transaction, transaction.objectStore(WORLD_STORE).get(worldId), (record) => {
      if (!record?.data || typeof record.data !== 'object') throw new Error('World not found');
      const revised = revise(record.data as Record<string, unknown>);
      if (revised === record.data) return;
      putWorldRecord(transaction, { ...record, data: revised });
      wrote = true;
    });
    if (wrote) announceWorldSaved(worldId);
  }

  /** Load one world's full `data` (with `id` injected); rejects if missing, malformed, or lacking any
   *  required section. */
  async getWorldData(worldId: string) {
    await this.ensureInitialized();

    // Validate worldId
    if (!worldId) {
      return Promise.reject('World ID is required');
    }

    // Normalize worldId
    const normalizedWorldId = String(worldId).trim();
    if (!normalizedWorldId) {
      console.error('Invalid world ID:', worldId);
      return Promise.reject('Invalid world ID');
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([WORLD_STORE], 'readonly');
        const store = transaction.objectStore(WORLD_STORE);

        // Validate the store exists
        if (!store) {
          throw new Error('Object store not found');
        }
        const request = store.get(worldId);
        request.onsuccess = () => {
          if (request.result) {
            //console.log('Retrieved world data:', request.result);
            // Validate the world data structure
            if (!request.result.data || typeof request.result.data !== 'object') {
              console.error('Missing or invalid data object');
              reject('Invalid world data format');
            } else if (!request.result.data.worldOverview ||
                       !request.result.data.stats ||
                       !request.result.data.locations ||
                       !request.result.data.entities ||
                       !request.result.data.traits ||
                       !request.result.data.statUpdates) {
              console.error('Missing required fields in data:', {
                worldOverview: !!request.result.data.worldOverview,
                stats: !!request.result.data.stats,
                locations: !!request.result.data.locations,
                entities: !!request.result.data.entities,
                traits: !!request.result.data.traits,
                statUpdates: !!request.result.data.statUpdates
              });
              reject('Invalid world data format');
            } else {
              // Add the ID to the data before returning it
              const worldData = request.result.data;
              worldData.id = worldId; // Ensure the ID is included in the returned data
              resolve(worldData);
            }
          } else {
            reject('World not found');
          }
        };
        request.onerror = (event) => {
          console.error('Database error:', (event.target as IDBRequest).error);
          reject(`Failed to get world data: ${(event.target as IDBRequest).error}`);
        };
      } catch (error) {
        console.error('Transaction setup error:', error);
        reject(`Failed to set up database transaction: ${(error as Error).message}`);
      }
    });
  }

  /** Upsert a world by `id`, read-merging sticky local-only fields (`sourceId`, `dirty`, `createdAt`, etc.)
   *  so the community download link and creation stamp survive edits; throws on missing required fields. */
  async storeWorld(world: StoredWorldRecord) {
    await this.ensureInitialized();

    //Generate unique ID always
    // world.id = `world-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    //  console.log('Generated new world ID:', world.id);

    // Validate world data structure
    if (!world.name || !world.data ||
        !world.data.worldOverview || !world.data.stats ||
        !world.data.locations || !world.data.entities ||
        !world.data.traits || !world.data.statUpdates) {
      throw new Error('Invalid world data: missing required fields');
    }

    const transaction = libraryTransaction(this.db!, 'readwrite');
    // Read-merge so the download link survives saves: sourceId is sticky (inherited unless the
    // caller supplies one), and dirty defaults to the existing/false unless the caller sets it.
    // The sticky fields all live in the metadata record, so the old world data is never read.
    const read = transaction.objectStore(WORLD_META_STORE).get(world.id) as IDBRequest<WorldMetaRecord | undefined>;
    await writeAfterRead(transaction, read, (existing) => {
      putWorldRecord(transaction, {
        id: world.id,
        name: world.name,
        description: world.description || '',
        author: world.author || '',
        thumbnail: world.thumbnail || '',
        sourceId: world.sourceId ?? existing?.sourceId,
        dirty: world.dirty ?? existing?.dirty ?? false,
        editedAt: world.editedAt ?? existing?.editedAt,
        downloadedAt: world.downloadedAt ?? existing?.downloadedAt,
        sourceUpdatedAt: world.sourceUpdatedAt ?? existing?.sourceUpdatedAt,
        sourceAuthorId: world.sourceAuthorId ?? existing?.sourceAuthorId,
        sourceHash: world.sourceHash ?? existing?.sourceHash,
        data: world.data,
        // createdAt is sticky: stamped once on first store, preserved across later saves.
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        lastAccessed: new Date().toISOString()
      });
    });
    announceWorldSaved(world.id);
    // A default deleted in another tab and saved back here exists again.
    forgetDeletedDefaultWorld(world.id);
  }

  /** Seed missing default worlds and auto-update unedited ones whose bundled content no longer matches the
   *  stored copy's `sourceHash`. Runs every launch (cheap when nothing changed). A world is left untouched if
   *  the player has edited it (`dirty`), since that diverges from the bundled default (git-dirty model), or if
   *  they deleted it — absent alone can't be trusted to mean "never seeded", so a deleted default carries a
   *  tombstone and stays gone even when the bundled copy changes.
   *  `readBundled` is `readBundledWorld`, passed in so this module never bundles the worlds.
   *  Returns the ids that failed to load plus the display names auto-updated in place. */
  async loadDefaultWorlds(
    defaultWorlds: DefaultWorldSeed[],
    readBundled: (id: string) => Promise<string>,
  ): Promise<DefaultWorldSyncResult> {
    await this.ensureInitialized();
    const deleted = readDeletedDefaultWorlds();
    defaultWorlds = defaultWorlds.filter((w) => !deleted.has(w.id));
    // Metadata by id: only the bundled defaults are compared, and only their `sourceHash` and `dirty`.
    const stored = await Promise.all(defaultWorlds.map((w) => readWorldMeta(this.db!, w.id)));
    const byId = new Map<string, { dirty?: boolean; sourceHash?: string }>(
      stored.filter((w): w is WorldMetaRecord => !!w).map((w) => [w.id, w]),
    );

    const failed: string[] = [];
    const errors: Error[] = [];
    const updated: string[] = [];
    await Promise.all(
      defaultWorlds.map(async world => {
        try {
          const existing = byId.get(world.id);
          // Hash the raw text, then parse it — one read, and no re-serializing a multi-MB parsed world.
          const raw = await readBundled(world.id);
          const hash = contentHash(raw);
          // A copy seeded before hashing existed has no hash to compare; reseed once to adopt the current
          // bundle (its content may genuinely differ), then it converges like any other.
          const backfill = existing !== undefined && existing.sourceHash === undefined;

          if (existing) {
            // Replace only an unedited copy whose content differs from the bundle. An edited world (`dirty`)
            // is always left alone (git-dirty model). Comparing the *content* — not a version — is what makes
            // this converge: after a reseed the hashes match, so it can't re-fire on every launch.
            if (existing.dirty || existing.sourceHash === hash) return;
          }

          // storeWorld keeps sticky local fields (createdAt, sourceId) and a false `dirty` on this update.
          const data = seedWorldData(JSON.parse(raw), world);
          const fullWorld = {
            id: world.id,
            name: data.worldOverview?.name || world.defaultName,
            description: data.worldOverview?.description || `Default ${world.defaultName} world`,
            author: data.worldOverview?.author || '',
            thumbnail: data.worldOverview?.thumbnail || '',
            data,
          };
          await this.storeWorld({ ...fullWorld, sourceHash: hash });
          // Only announce a real content change: a first-run seed has nothing to compare, and a backfill is
          // just adopting the hash — neither is news to the player.
          if (existing && !backfill) updated.push(fullWorld.name);
        } catch (error) {
          console.error(`Error loading world ${world.id}:`, error);
          failed.push(world.id); // Skip this world but continue with others; report it as failed.
          errors.push(new Error(world.id, { cause: error }));
        }
      }),
    );
    return { failed, errors, updated };
  }

  /** Remove a world from IndexedDB by `id`; this is the only path that drops the sticky `sourceId` link. */
  async deleteWorld(worldId: string) {
    await this.ensureInitialized();

    if (!worldId) {
      throw new Error('World ID is required');
    }

    const transaction = libraryTransaction(this.db!, 'readwrite');
    deleteWorldRecord(transaction, worldId);
    await transactionDone(transaction);
    announceWorldDeleted(worldId);
    // Deleting a default is permanent: without this the next seed pass sees it missing and re-creates it.
    // A no-op for any non-default id.
    tombstoneDefaultWorld(worldId);
  }
}

export default new WorldStorageService();
