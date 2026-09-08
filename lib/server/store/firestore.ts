import type {
  Firestore,
  Query as FirestoreQuery,
  Transaction,
  WhereFilterOp,
} from "firebase-admin/firestore";
import { firebaseApp } from "../firebaseApp";
import {
  ConflictError,
  type Collection,
  type Query,
  type Store,
  type Tx,
  type Where,
} from "./types";

// firebase-admin is loaded lazily so the SQLite deployment never pays for it.
let connection: Promise<Firestore> | undefined;

export async function firestore(): Promise<Firestore> {
  if (connection) return connection;
  connection = (async () => {
    const { getFirestore } = await import("firebase-admin/firestore");
    const database = getFirestore(await firebaseApp());
    try {
      // Undefined fields are normal in this model (nullable propertyId, unitId).
      database.settings({ ignoreUndefinedProperties: true });
    } catch {
      // settings() throws once the instance has been used; harmless.
    }
    return database;
  })();
  return connection;
}

/** Test seam: drops the memoised handle so a new project can be attached. */
export function resetFirestore() {
  connection = undefined;
}

const OPERATORS: Record<Where[1], WhereFilterOp> = {
  "==": "==",
  "!=": "!=",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
};

function shape(
  database: Firestore,
  collection: Collection,
  query: Query = {},
): FirestoreQuery {
  let result: FirestoreQuery = database.collection(collection);
  for (const [field, op, value] of query.where || [])
    result = result.where(field, OPERATORS[op], value);
  for (const order of query.orderBy || [])
    result = result.orderBy(field(order.field), order.direction || "asc");
  if (query.limit) result = result.limit(query.limit);
  return result;
}

// Firestore reserves no field names here, but keeping the indirection makes
// the two backends' field handling obviously parallel.
function field(name: string) {
  return name;
}

function materialise<T>(
  documents: { id: string; data(): Record<string, unknown> | undefined }[],
): T[] {
  return documents.map((doc) => ({ ...doc.data(), id: doc.id }) as T);
}

function conflict(error: unknown) {
  const code = (error as { code?: number | string })?.code;
  return code === 6 || code === "already-exists";
}

export class FirestoreStore implements Store {
  readonly name = "firebase" as const;

  async get<T>(collection: Collection, id: string) {
    const database = await firestore();
    const snapshot = await database.collection(collection).doc(id).get();
    if (!snapshot.exists) return undefined;
    return { ...snapshot.data(), id: snapshot.id } as T;
  }

  async find<T>(collection: Collection, query: Query = {}) {
    const database = await firestore();
    const snapshot = await shape(database, collection, query).get();
    return materialise<T>(snapshot.docs);
  }

  async first<T>(collection: Collection, query: Query = {}) {
    return (await this.find<T>(collection, { ...query, limit: 1 }))[0];
  }

  async count(collection: Collection, query: Query = {}) {
    const database = await firestore();
    const snapshot = await shape(database, collection, query).count().get();
    return snapshot.data().count;
  }

  async tx<T>(work: (t: Tx) => Promise<T>): Promise<T> {
    const database = await firestore();
    try {
      return await database.runTransaction(async (transaction: Transaction) => {
        const handle = this.handle(database, transaction);
        return work(handle);
      });
    } catch (error) {
      if (conflict(error)) throw new ConflictError();
      throw error;
    }
  }

  private handle(database: Firestore, transaction: Transaction): Tx {
    const ref = (collection: Collection, id: string) =>
      database.collection(collection).doc(id);
    return {
      get: async (collection, id) => {
        const snapshot = await transaction.get(ref(collection, id));
        if (!snapshot.exists) return undefined;
        return { ...snapshot.data(), id: snapshot.id } as never;
      },
      find: async (collection, query) => {
        const snapshot = await transaction.get(
          shape(database, collection, query),
        );
        return materialise(snapshot.docs) as never;
      },
      first: async (collection, query) => {
        const snapshot = await transaction.get(
          shape(database, collection, { ...query, limit: 1 }),
        );
        return materialise(snapshot.docs)[0] as never;
      },
      count: async (collection, query) => {
        const snapshot = await transaction.get(
          shape(database, collection, query).count(),
        );
        return snapshot.data().count;
      },
      create: (collection, id, data) => {
        transaction.create(ref(collection, id), { ...data, id });
      },
      set: (collection, id, data) => {
        transaction.set(ref(collection, id), { ...data, id });
      },
      update: (collection, id, patch) => {
        transaction.update(ref(collection, id), { ...patch });
      },
      remove: (collection, id) => {
        transaction.delete(ref(collection, id));
      },
      reserve: (key, owner) => {
        transaction.create(ref("reservations", key), {
          id: key,
          owner,
          createdAt: new Date().toISOString(),
        });
      },
      release: (key) => {
        transaction.delete(ref("reservations", key));
      },
    };
  }

  private async batched(
    collection: Collection,
    query: Query,
    mutate: (
      batch: FirebaseFirestore.WriteBatch,
      ref: FirebaseFirestore.DocumentReference,
    ) => void,
  ) {
    const database = await firestore();
    const snapshot = await shape(database, collection, query).get();
    let written = 0;
    for (let index = 0; index < snapshot.docs.length; index += 400) {
      const slice = snapshot.docs.slice(index, index + 400);
      const batch = database.batch();
      for (const doc of slice) mutate(batch, doc.ref);
      await batch.commit();
      written += slice.length;
    }
    return written;
  }

  async updateWhere(
    collection: Collection,
    query: Query,
    patch: Record<string, unknown>,
  ) {
    return this.batched(collection, query, (batch, ref) =>
      batch.update(ref, { ...patch }),
    );
  }

  async removeWhere(collection: Collection, query: Query) {
    return this.batched(collection, query, (batch, ref) => batch.delete(ref));
  }

  async close() {
    const database = await firestore().catch(() => undefined);
    await database?.terminate().catch(() => undefined);
    resetFirestore();
  }
}
