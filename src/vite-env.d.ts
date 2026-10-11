/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Public VAPID key for Web Push. Without it, notifications are hidden. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** Base URL of the notification backend; defaults to same-origin `/api`. */
  readonly VITE_PUSH_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
