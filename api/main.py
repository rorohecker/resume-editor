"""Optional BYOK CORS proxy for OpenAI / Gemini.

The V1 frontend is local-first and keeps API keys in the browser. Claude works
cross-origin with Anthropic's browser-access header. OpenAI and Gemini often
block browser origins via CORS.

For local development, Vite already proxies `/byok/openai` and `/byok/gemini`
(see `vite.config.ts`). This FastAPI app is an optional same-origin alternative
if you serve the built frontend behind a small backend.

Keys are still supplied by the client on each request (true BYOK). This service
never stores a developer-owned key.
"""

from __future__ import annotations

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Resume Editor API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_BASE = "https://api.openai.com"
GEMINI_BASE = "https://generativelanguage.googleapis.com"


class HealthResponse(BaseModel):
    status: str
    backend: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", backend="byok_proxy")


@app.api_route("/byok/openai/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def proxy_openai(path: str, request: Request) -> Response:
    return await _forward(OPENAI_BASE, path, request)


@app.api_route("/byok/gemini/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"])
async def proxy_gemini(path: str, request: Request) -> Response:
    return await _forward(GEMINI_BASE, path, request)


async def _forward(base: str, path: str, request: Request) -> Response:
    url = f"{base.rstrip('/')}/{path.lstrip('/')}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    # Forward caller auth; never inject a server-side key.
    hop_by_hop = {"host", "content-length", "connection", "transfer-encoding"}
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in hop_by_hop
    }
    body = await request.body()

    async with httpx.AsyncClient(timeout=60.0) as client:
        upstream = await client.request(
            request.method,
            url,
            headers=headers,
            content=body,
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )
