export type Item = {
  id: string
  name: string
  unitWeightGrams: number
  quantity: number
  unitPriceCents: number
}

export type Shipment = {
  id: string
  name: string
  createdAt: string
  packagingWeightGrams: number
  items: Item[]
}

const DB_NAME = 'parcel-calculator-db'
const STORE = 'shipments'
const DB_VERSION = 2

function migrateV1Shipment(raw: Record<string, unknown>): Shipment {
  const oldItems = Array.isArray(raw.items) ? raw.items as Array<Record<string, unknown>> : []
  const items: Item[] = oldItems.map(item => ({
    id: String(item.id ?? crypto.randomUUID()),
    name: String(item.name ?? ''),
    // Version 1 stored weights in kilograms and prices in euros.
    unitWeightGrams: Math.round(Number(item.unitWeight ?? 0) * 1000),
    quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1))),
    unitPriceCents: Math.round(Number(item.unitPrice ?? 0) * 100),
  }))

  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: String(raw.name ?? 'Посылка без названия'),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    packagingWeightGrams: Math.round(Number(raw.packagingWeight ?? 0) * 1000),
    items,
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = event => {
      const db = request.result
      const transaction = request.transaction
      if (!transaction) return

      if (event.oldVersion === 0) {
        db.createObjectStore(STORE, { keyPath: 'id' })
        return
      }

      if (event.oldVersion === 1) {
        const store = transaction.objectStore(STORE)
        const cursorRequest = store.openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return
          cursor.update(migrateV1Shipment(cursor.value as Record<string, unknown>))
          cursor.continue()
        }
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('База данных занята другой вкладкой. Закрой другие вкладки приложения и обнови страницу.'))
  })
}

export async function getShipments(): Promise<Shipment[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve((request.result as Shipment[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    request.onerror = () => reject(request.error)
  })
}

export async function saveShipment(shipment: Shipment): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(shipment)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deleteShipment(id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
