/**
 * Best-effort request for persistent storage, so the browser (notably iOS
 * Safari) does not evict the student's on-device data under storage pressure.
 *
 * Resolves `true` only when the browser grants persistence; `false` when the
 * API is missing, the request is denied, or it throws. Never rejects.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storage || typeof storage.persist !== 'function') {
      return false;
    }
    return (await storage.persist()) === true;
  } catch {
    return false;
  }
}
