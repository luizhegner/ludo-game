/**
 * Wrapper mínimo de IndexedDB pro histórico de partidas.
 *
 * Por que não localStorage: uma partida de 4 jogadores até sobrar um dá
 * ~80 KB de JSON (o log completo vai junto); em 5 MB caberiam ~60 partidas.
 * IndexedDB guarda centenas de MB sem esforço e não bloqueia a UI.
 *
 * Uma store só (`games`), chave = id da partida, índice por `updatedAt`.
 * Todas as funções resolvem mesmo sem IndexedDB (navegador privado antigo,
 * ambiente de teste sem shim): `open()` devolve null e as demais viram no-op.
 */
import type { GameState } from '../engine/types';

export const DB_NAME = 'ludo';
export const DB_VERSION = 1;
const STORE = 'games';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // se outra aba/versão pedir upgrade, solta a conexão pra não travar
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const t = db.transaction(STORE, mode);
          const store = t.objectStore(STORE);
          const req = run(store);
          let result: T | undefined;
          if (req) req.onsuccess = () => (result = req.result);
          t.oncomplete = () => resolve(result);
          t.onerror = () => resolve(undefined);
          t.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

/** Todas as partidas, da mais recente pra mais antiga. */
export async function idbGetAll(): Promise<GameState[]> {
  const list = await tx<GameState[]>('readonly', (s) => s.getAll());
  return (list ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function idbPut(game: GameState): Promise<void> {
  return tx('readwrite', (s) => {
    s.put(game);
  }).then(() => undefined);
}

export function idbPutMany(games: GameState[]): Promise<void> {
  return tx('readwrite', (s) => {
    for (const g of games) s.put(g);
  }).then(() => undefined);
}

export function idbDelete(id: string): Promise<void> {
  return tx('readwrite', (s) => {
    s.delete(id);
  }).then(() => undefined);
}

export function idbClear(): Promise<void> {
  return tx('readwrite', (s) => {
    s.clear();
  }).then(() => undefined);
}

/** Substitui tudo de uma vez (importar backup). */
export function idbReplaceAll(games: GameState[]): Promise<void> {
  return tx('readwrite', (s) => {
    s.clear();
    for (const g of games) s.put(g);
  }).then(() => undefined);
}

/** Pra testes: fecha a conexão e esquece o cache. */
export async function idbReset(): Promise<void> {
  const db = await (dbPromise ?? Promise.resolve(null));
  db?.close();
  dbPromise = null;
}
