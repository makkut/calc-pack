import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseServices } from './firebase'
import type { Shipment } from './db'

function shipmentsCollection(uid: string) {
  const { db } = getFirebaseServices()
  return collection(db, 'users', uid, 'shipments')
}

function normalizeShipment(id: string, raw: Record<string, unknown>): Shipment {
  const rawItems = Array.isArray(raw.items) ? raw.items : []
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : 'Посылка без названия',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    packagingWeightGrams: Math.max(0, Math.round(Number(raw.packagingWeightGrams) || 0)),
    items: rawItems.map((value, index) => {
      const item = value as Record<string, unknown>
      return {
        id: typeof item.id === 'string' ? item.id : `item-${index}`,
        name: typeof item.name === 'string' ? item.name : '',
        unitWeightGrams: Math.max(0, Math.round(Number(item.unitWeightGrams) || 0)),
        quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
        unitPriceCents: Math.max(0, Math.round(Number(item.unitPriceCents) || 0)),
      }
    }),
  }
}

export function watchShipments(
  uid: string,
  onData: (shipments: Shipment[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const q = query(shipmentsCollection(uid), orderBy('createdAt', 'desc'))
  return onSnapshot(q, snapshot => {
    onData(snapshot.docs.map(item => normalizeShipment(item.id, item.data())))
  }, error => onError(error))
}

export async function saveCloudShipment(uid: string, shipment: Shipment): Promise<void> {
  const { db } = getFirebaseServices()
  const ref = doc(db, 'users', uid, 'shipments', shipment.id)
  await setDoc(ref, {
    ...shipment,
    ownerUid: uid,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function deleteCloudShipment(uid: string, shipmentId: string): Promise<void> {
  const { db } = getFirebaseServices()
  await deleteDoc(doc(db, 'users', uid, 'shipments', shipmentId))
}

/** Imports local IndexedDB records only when their document IDs do not exist in the cloud. */
export async function importLocalShipments(
  uid: string,
  localShipments: Shipment[],
): Promise<{ imported: number; alreadyInCloud: number }> {
  const existingSnapshot = await getDocs(shipmentsCollection(uid))
  const existingIds = new Set(existingSnapshot.docs.map(item => item.id))
  const toImport = localShipments.filter(item => !existingIds.has(item.id))

  await Promise.all(toImport.map(shipment => saveCloudShipment(uid, shipment)))
  return {
    imported: toImport.length,
    alreadyInCloud: localShipments.length - toImport.length,
  }
}
