// Wrapper de IndexedDB usando `idb`.
// Dos stores:
//   - `equipos`     → cache de la última lista fetched (para arrancar
//                     instantáneamente cuando volvés a abrir la app
//                     sin internet).
//   - `pendingWrites` → cola de operaciones que se hicieron offline.
//                     Cada item es { id, type, payload, createdAt, retries }.

import { openDB } from 'idb'

const DB_NAME = 'inventario-licman'
const DB_VERSION = 1

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('equipos')) {
          db.createObjectStore('equipos', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('pendingWrites')) {
          db.createObjectStore('pendingWrites', {
            keyPath: 'id',
            autoIncrement: true,
          })
        }
      },
    })
  }
  return dbPromise
}

// ----- Cache de equipos -------------------------------------------------

export async function cacheEquipos(equipos) {
  const db = await getDB()
  const tx = db.transaction('equipos', 'readwrite')
  await tx.store.clear()
  for (const e of equipos) {
    await tx.store.put(e)
  }
  await tx.done
}

export async function getCachedEquipos() {
  const db = await getDB()
  return (await db.getAll('equipos')) ?? []
}

// ----- Cola de pending writes ------------------------------------------

export async function enqueuePendingWrite(item) {
  const db = await getDB()
  const id = await db.add('pendingWrites', {
    ...item,
    createdAt: new Date().toISOString(),
    retries: 0,
  })
  return id
}

export async function getPendingWrites() {
  const db = await getDB()
  return (await db.getAll('pendingWrites')) ?? []
}

export async function getPendingCount() {
  const db = await getDB()
  return db.count('pendingWrites')
}

export async function removePendingWrite(id) {
  const db = await getDB()
  await db.delete('pendingWrites', id)
}

export async function incrementPendingRetry(id) {
  const db = await getDB()
  const item = await db.get('pendingWrites', id)
  if (!item) return null
  item.retries = (item.retries ?? 0) + 1
  await db.put('pendingWrites', item)
  return item
}

// ----- Clear total (debug / reset) -------------------------------------

export async function clearAll() {
  const db = await getDB()
  await Promise.all([db.clear('equipos'), db.clear('pendingWrites')])
}