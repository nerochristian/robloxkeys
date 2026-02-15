/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_BOT_API_URL?: string;
  readonly VITE_BOT_API_PREFIX?: string;
  readonly VITE_BOT_API_KEY?: string;
  readonly VITE_BOT_API_KEY_HEADER?: string;
  readonly VITE_BOT_API_AUTH_SCHEME?: string;
  readonly VITE_BOT_API_TIMEOUT_MS?: string;
  readonly VITE_STORE_API_URL?: string;
  readonly VITE_STORE_API_PREFIX?: string;
  readonly VITE_STORE_API_KEY?: string;
  readonly VITE_STORE_API_KEY_HEADER?: string;
  readonly VITE_STORE_API_AUTH_SCHEME?: string;
  readonly VITE_STORE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
