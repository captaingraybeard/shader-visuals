FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-venv python3-pip git && \
    rm -rf /var/lib/apt/lists/*

RUN python3.11 -m pip install --upgrade pip

WORKDIR /app

# Install Python deps (cache layer)
COPY server/requirements-runpod.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server/ server/

# Pre-download models at build time so cold starts are fast.
# RunPod also supports HF_MODEL_CACHE for cached models, but baking in
# guarantees they're always there.
ENV HF_HOME=/app/models
RUN python3.11 -c "\
from transformers import pipeline; \
print('Downloading Depth Anything V2 Large...'); \
pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Large-hf', device='cpu'); \
print('Downloading MaskFormer Swin-Large ADE20K...'); \
pipeline('image-segmentation', model='facebook/maskformer-swin-large-ade', device='cpu'); \
print('Models downloaded.') \
"

# RunPod handler entrypoint
CMD ["python3.11", "-u", "server/handler.py"]
