"""FastAPI placeholder for future optional server integrations.

The V1 frontend is local-first and uses browser-side BYOK for AI. This file
documents an optional backend boundary for future features without introducing a
developer-owned API key path.
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="Resume Editor API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str
    backend: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", backend="optional_placeholder")
