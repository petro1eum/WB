/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WB: string
  readonly VITE_WB_STATISTICS: string
  readonly VITE_OPENAI_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 