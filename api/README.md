# API

Optional placeholder for a thin BYOK proxy if you need OpenAI or Gemini from the browser.

## Why this exists

Claude (Anthropic) allows browser calls when the request includes
`anthropic-dangerous-direct-browser-access: true` (already wired in `src/utils/aiByok.ts`).

OpenAI and Google Gemini APIs often **block browser origins via CORS**. In that case the
app surfaces a clear error. Local heuristic tools still work without any network.

## Recommended approaches

1. Prefer **Claude** for in-browser BYOK (no server required).
2. Or run a tiny same-origin proxy that:
   - Accepts `{ provider, model, prompt, maxTokens }`
   - Attaches the API key from an env var / secret store (never echo it to logs)
   - Forwards to the provider and returns plain text
3. Keep keys out of the client when using a proxy — the in-app settings key field is for true BYOK only.

V1 does not require this folder to run. The frontend works fully offline with local heuristics.
