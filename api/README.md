# API

Optional thin BYOK proxy if you need OpenAI or Gemini outside Vite’s local CORS proxy.

## Why this exists

Claude (Anthropic) allows browser calls when the request includes
`anthropic-dangerous-direct-browser-access: true` (already wired in `src/utils/aiByok.ts`).

OpenAI and Google Gemini APIs often **block browser origins via CORS**. In that case the
app surfaces a clear error. Local heuristic tools still work without any network.

## Local development (recommended)

`npm run dev` already proxies:

- `/byok/openai` → `https://api.openai.com`
- `/byok/gemini` → `https://generativelanguage.googleapis.com`

The browser keeps your key; Vite only strips CORS. No FastAPI process required for day-to-day use.

`vite preview` uses the same `/byok/*` proxy. For a production build that should call
`/byok/*` instead of the provider hosts directly, set `VITE_BYOK_PROXY=1` at build time
and put a reverse proxy (or this FastAPI app) in front of `/byok/*`.

## Optional FastAPI proxy

If you serve a static build and still want OpenAI/Gemini:

```bash
cd api
pip install fastapi uvicorn httpx
uvicorn main:app --reload --port 8787
```

Point a reverse proxy so `/byok/*` hits this server, and build the frontend with
`VITE_BYOK_PROXY=1`. The client still sends the API key on each request — this backend
never stores a developer key.

## Recommended approaches

1. Prefer **Claude** for static / single-file / GitHub Pages builds (no server required).
2. Use **`npm run dev`** for OpenAI/Gemini while iterating.
3. Or run the FastAPI forwarder above behind your static host.

V1 does not require this folder to run. The frontend works fully offline with local heuristics.
