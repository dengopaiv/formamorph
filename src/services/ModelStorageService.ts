import { randomUUID } from '@/lib/uuid';
import { promisifyRequest, transactionDone, writeAfterRead } from '@/lib/idb';
import { blobHash } from '@/lib/blobHash';
import { readVrmMeta } from '@/lib/vrmMeta';
import { optimizeImageDataUrl, IMAGE_CAPS } from '@/lib/imageOptim';
import { DEFAULT_AVATAR_ID, LEGACY_DEFAULT_AVATAR_ID } from '@/lib/defaultAvatar';
import { LibraryStore, type StoredRecord } from './LibraryStore';
import type { ModelMetadata, VrmData } from '@/types';

/** A locally-stored VRM plus its library timestamps. Local-only, like `StoredEntityRecord`. */
export type StoredModelRecord = StoredRecord<VrmData>;

/**
 * The pre-library record shape: the VRM's descriptors sat at the top level rather than under `data`, and
 * the creation stamp was named `addedAt`. Read only by the one-time migration below.
 */
interface FlatModelRecord {
  id: string;
  name: string;
  type?: string;
  blob?: Blob;
  size?: number;
  addedAt?: string;
}

const isFlat = (record: unknown): record is FlatModelRecord =>
  !!record && typeof record === 'object' && !('data' in record) && 'blob' in record;

/**
 * Bring an embedded thumbnail down to card size and re-encode it to WebP.
 *
 * A VRM's own thumbnail is authored for a storefront, not a tile: real files carry multi-megabyte PNGs (one
 * sample ships a 1.6MB 2048px image), and base64 adds a third on top. Every one of those rides in
 * `ModelMetadata`, so the whole grid would load them all. The rendered fallback is already WebP; this puts the
 * embedded path on the same footing. `optimizeImageDataUrl` hands back the original if it can't do better, so
 * this is safe to apply unconditionally.
 */
const shrinkThumbnail = (thumbnail: string | undefined): Promise<string | undefined> =>
  thumbnail ? optimizeImageDataUrl(thumbnail, IMAGE_CAPS.thumbnail) : Promise.resolve(undefined);

/** A freshly read file's thumbnail fields: its embedded image shown as the file variant, or `null` for none. */
const fileThumbnailFields = async (embedded: string | undefined): Promise<Pick<VrmData, 'thumbnail' | 'fileThumbnail'>> => {
  const fileThumbnail = (await shrinkThumbnail(embedded)) ?? null;
  return { thumbnail: fileThumbnail ?? undefined, fileThumbnail };
};

/** Shared by the store's grid listing and the lookups that read raw records. */
const toMetadata = (record: StoredModelRecord): ModelMetadata => ({
  id: record.id,
  name: record.name,
  type: record.data?.type ?? '',
  size: record.data?.size ?? 0,
  thumbnail: record.data?.thumbnail,
  thumbnailSource: record.data?.thumbnailSource,
  hasFileThumbnail: record.data?.fileThumbnail === undefined ? undefined : !!record.data.fileThumbnail,
  license: record.data?.license,
  createdAt: record.createdAt,
  lastAccessed: record.lastAccessed,
  // The community link travels with the metadata: the library grid never shows it, but the download flow
  // reads these to tell a fresh listing from one already held (see lib/downloadState).
  sourceId: record.sourceId,
  dirty: record.dirty,
  editedAt: record.editedAt,
  downloadedAt: record.downloadedAt,
  sourceUpdatedAt: record.sourceUpdatedAt,
});

/**
 * Singleton owning the local model library (IndexedDB `FORMAMORPH_MODELS_DB`/`models`). Kept out of the
 * save-game DB (`dbUtils`) because that one opens versionlessly and can't gain a new object store cleanly.
 * VRMs are stored as Blobs — lighter than base64 for multi-MB files, and GLTFLoader accepts the resulting
 * `blob:` URLs. The CRUD lives in `LibraryStore`; this names the operations in model terms and folds the
 * legacy flat records forward.
 */
class ModelStorageService {
  private readonly store = new LibraryStore<VrmData, ModelMetadata>({
    dbName: 'FORMAMORPH_MODELS_DB',
    storeName: 'models',
    noun: 'Model',
    // Presence, not `instanceof Blob`: structured-clone round-trips don't guarantee the constructor
    // identity of this realm, and a missing payload is the failure actually worth catching.
    isValid: (model) => !!model.blob,
    toMetadata,
  });

  /** Runs once per session; later calls await the same pass rather than rescanning. */
  private migration: Promise<void> | null = null;

  /** Open the IndexedDB connection (idempotent). */
  initialize() {
    return this.store.initialize();
  }

  /** Every stored record, wrapper included — `LibraryStore` only exposes projected metadata or bare payloads. */
  private async allRecords(): Promise<StoredModelRecord[]> {
    await this.store.ensureInitialized();
    return promisifyRequest<StoredModelRecord[]>(
      this.store.db!.transaction(['models'], 'readonly').objectStore('models').getAll(),
    );
  }

  /**
   * Persist `data` onto an existing record, but only if the record is still there — a delete that lands while
   * a thumbnail is being computed must not be undone by the backfill writing the row back. The get and put
   * share one readwrite transaction, which IndexedDB serializes against a concurrent delete, so the check and
   * the write can't interleave. Resolves to whether the record was still there.
   */
  private async updateDataIfPresent(id: string, data: VrmData): Promise<boolean> {
    await this.store.ensureInitialized();
    const store = this.store.db!.transaction(['models'], 'readwrite').objectStore('models');
    let present = false;
    await writeAfterRead(store.transaction, store.get(id), (existing: StoredModelRecord | undefined) => {
      if (!existing) return; // deleted meanwhile — leave it gone
      present = true;
      store.put({ ...existing, data });
    });
    return present;
  }

  /** One stored record with its wrapper, or null. */
  private async getRecord(id: string): Promise<StoredModelRecord | null> {
    await this.store.ensureInitialized();
    const record = await promisifyRequest<StoredModelRecord | undefined>(
      this.store.db!.transaction(['models'], 'readonly').objectStore('models').get(id),
    );
    return record ?? null;
  }

  /**
   * Fold any pre-library flat records into the wrapped shape, in place, then move the seeded default onto its
   * current id. Runs before every operation because a flat record has no `data` and would otherwise read as
   * missing, and because a save migrated to the new default id must find a record waiting under it.
   */
  private async ensureMigrated(): Promise<void> {
    this.migration ??= (async () => {
      await this.store.ensureInitialized();
      const db = this.store.db!;
      const raw = await promisifyRequest<unknown[]>(
        db.transaction(['models'], 'readonly').objectStore('models').getAll(),
      );
      const flat = raw.filter(isFlat);
      if (flat.length) {
        const write = db.transaction(['models'], 'readwrite').objectStore('models');
        await Promise.all(
          flat.map((record) =>
            promisifyRequest(
              write.put({
                id: record.id,
                name: record.name,
                createdAt: record.addedAt,
                lastAccessed: record.addedAt,
                data: { type: record.type ?? 'model/vrm', blob: record.blob!, size: record.size ?? 0 },
              } satisfies StoredModelRecord),
            ),
          ),
        );
      }
      await this.rekeyLegacyDefault();
    })();
    return this.migration;
  }

  /**
   * Move the seeded default from its pre-rename id to the current one. An IndexedDB key can't be edited, so
   * this is a delete plus a re-put of the same record — done in one readwrite transaction so a reload
   * mid-migration can't lose the avatar. A record already sitting at the current id wins and the legacy copy
   * is simply dropped, which is what a library holding both would mean: the same file stored twice.
   */
  private async rekeyLegacyDefault(): Promise<void> {
    const legacy = await this.getRecord(LEGACY_DEFAULT_AVATAR_ID);
    if (!legacy) return;
    const occupied = !!(await this.getRecord(DEFAULT_AVATAR_ID));
    await this.store.ensureInitialized();
    const store = this.store.db!.transaction(['models'], 'readwrite').objectStore('models');
    store.delete(LEGACY_DEFAULT_AVATAR_ID);
    if (!occupied) store.put({ ...legacy, id: DEFAULT_AVATAR_ID });
    await transactionDone(store.transaction);
  }

  /**
   * Store an uploaded VRM file and return its library record. Reads the file's own metadata up front — that's
   * cheap and pure — but leaves the thumbnail render to `ensureThumbnail`, since only files with no embedded
   * thumbnail need it and rendering costs a GPU context.
   */
  async addModel(file: File): Promise<StoredModelRecord> {
    await this.ensureMigrated();
    const [hash, { license, thumbnail }] = await Promise.all([blobHash(file), readVrmMeta(file)]);
    const record: StoredModelRecord = {
      id: randomUUID(),
      // Prefer the model's own title over the filename, which is often a export-tool default.
      name: license.title?.trim() || file.name.replace(/\.[^.]+$/, ''),
      data: {
        type: file.type || 'model/vrm',
        blob: file,
        size: file.size,
        hash,
        license,
        ...await fileThumbnailFields(thumbnail),
      },
    };
    await this.store.store(record);
    return record;
  }

  /**
   * The stored model with the same bytes as `file`, if the library already holds one. Lets an import offer to
   * replace rather than silently keeping two copies of a multi-MB file.
   */
  async findDuplicate(file: Blob): Promise<ModelMetadata | null> {
    await this.ensureMigrated();
    const hash = await blobHash(file);
    const records = await this.allRecords();
    const match = records.find((record) => record.data?.hash === hash);
    return match ? toMetadata(match) : null;
  }

  /** Each model's name and content hash by id. A record stored before hashing gets its hash now, and keeps it. */
  async getModelHashes(): Promise<Map<string, { name: string; hash: string }>> {
    await this.ensureMigrated();
    const records = await this.allRecords();
    const hashed = await Promise.all(records.filter((record) => record.data?.blob).map(async (record) => {
      let hash = record.data.hash;
      if (!hash) {
        hash = await blobHash(record.data.blob);
        await this.updateDataIfPresent(record.id, { ...record.data, hash });
      }
      return [record.id, { name: record.name, hash }] as const;
    }));
    return new Map(hashed);
  }

  /** The id of the model holding `blob`'s bytes: an existing record with the same hash, else a new one. */
  async importModelBlob(blob: Blob, fileName: string): Promise<string> {
    const [hash, held] = await Promise.all([blobHash(blob), this.getModelHashes()]);
    const duplicate = [...held].find(([, model]) => model.hash === hash);
    if (duplicate) return duplicate[0];
    const file = new File([blob], fileName, { type: blob.type });
    return (await this.addModel(file)).id;
  }

  /** List stored models as grid metadata, newest first. */
  async getModelMetadata(): Promise<ModelMetadata[]> {
    await this.ensureMigrated();
    const models = await this.store.getMetadata();
    return models.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }

  /** Load one model's payload; rejects if missing or malformed. */
  async getModelData(id: string): Promise<VrmData> {
    await this.ensureMigrated();
    return this.store.getData(id);
  }

  /** Upsert a model by `id`; `createdAt` is sticky (stamped once), `lastAccessed` bumped each store. */
  async storeModel(model: StoredModelRecord): Promise<void> {
    await this.ensureMigrated();
    return this.store.store(model);
  }

  /**
   * Remove a model from the library by `id`, unless it's the only one left — the player must always have a
   * model to be. The rule is "at least one", not "keep the bundled default": once another model exists, the
   * default is as deletable as anything else.
   */
  async deleteModel(id: string): Promise<void> {
    await this.ensureMigrated();
    await this.store.ensureInitialized();
    // The count, the existence check, and the delete share one readwrite transaction. IndexedDB serializes
    // transactions over the store, so two concurrent deletes can't both see count > 1 and then both delete —
    // which a read-then-delete across separate transactions would allow, emptying the library.
    const store = this.store.db!.transaction(['models'], 'readwrite').objectStore('models');
    // Requests in one transaction run in order, so the count has its result when the get's arrives.
    const count = store.count();
    return writeAfterRead(store.transaction, store.get(id), (record) => {
      if (count.result <= 1 && record) {
        throw new Error('Cannot delete the last player avatar: the library must always have at least one.');
      }
      store.delete(id);
    });
  }
}

export default new ModelStorageService();
