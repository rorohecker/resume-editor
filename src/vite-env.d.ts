/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'mammoth/mammoth.browser' {
  interface Message { message: string; type: string; }
  interface ExtractRawTextResult { value: string; messages: Message[]; }
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractRawTextResult>;
}
