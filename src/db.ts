import type { Hand } from './types'

const DB_NAME = 'poker-hand-history'
const DB_VERSION = 1
const STORE_NAME = 'hands'

// Normalize hands saved by older versions of the app to the current shape.
function migrateHand(hand: Hand): Hand {
  // "NLHE" was renamed to "NLH".
  if ((hand.gameType as string) === 'NLHE') {
    return { ...hand, gameType: 'NLH' }
  }
  return hand
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

export async function saveHand(hand: Hand): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(hand)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getAllHands(): Promise<Hand[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => {
      const hands = (request.result as Hand[]).map(migrateHand)
      hands.sort((a, b) => b.createdAt - a.createdAt)
      resolve(hands)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getHand(id: string): Promise<Hand | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(id)
    request.onsuccess = () => {
      const hand = request.result as Hand | undefined
      resolve(hand ? migrateHand(hand) : undefined)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function deleteHand(id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
