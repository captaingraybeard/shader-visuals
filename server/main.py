"""FastAPI application — shader-visuals server."""

import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, JSONResponse
from pydantic import BaseModel

from .config import settings
from .models import get_loaded_models
from .pipeline import run_pipeline
from .storage import get_generation, get_asset_path

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Shader Visuals Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    prompt: str
    vibe: str = ""
    mode: str = "standard"  # "standard" or "panorama"
    api_key: str = ""


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "models": get_loaded_models(),
        "config": {
            "depth_model": settings.DEPTH_MODEL,
            "seg_model": settings.SEG_MODEL,
        },
    }


@app.post("/generate")
async def generate(req: GenerateRequest):
    api_key = req.api_key or settings.OPENAI_API_KEY
    if not api_key:
        raise HTTPException(400, "No OpenAI API key provided")

    try:
        result = await run_pipeline(
            prompt=req.prompt,
            api_key=api_key,
            mode=req.mode,
            vibe=req.vibe,
        )
    except Exception as e:
        logging.exception("Pipeline error")
        raise HTTPException(500, str(e))

    return Response(
        content=result,
        media_type="application/octet-stream",
        headers={"X-Content-Type": "shader-visuals/pointcloud"},
    )


@app.get("/generations/{gen_id}")
async def get_gen(gen_id: str):
    meta = get_generation(gen_id)
    if not meta:
        raise HTTPException(404, "Generation not found")
    return JSONResponse(meta)


@app.get("/generations/{gen_id}/{asset}")
async def get_gen_asset(gen_id: str, asset: str):
    path = get_asset_path(gen_id, asset)
    if not path:
        raise HTTPException(404, "Asset not found")
    return FileResponse(path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.PORT)
