const DATABASE_NAME = 'sonora-offline-audio'
const STORE_NAME = 'tracks'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage.'))
  })
}

export async function cacheAudio(videoId: string, url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Audio download failed (${response.status}).`)
  const blob = await response.blob()
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(blob, videoId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Could not save audio offline.'))
  })
  database.close()
}

export async function getCachedAudio(videoId: string) {
  const database = await openDatabase()
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(videoId)
    request.onsuccess = () => resolve(request.result as Blob | undefined)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return blob ? URL.createObjectURL(blob) : null
}

export async function hasCachedAudio(videoId: string) {
  const database = await openDatabase()
  const exists = await new Promise<boolean>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count(videoId)
    request.onsuccess = () => resolve(request.result > 0)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return exists
}
