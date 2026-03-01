FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps for pycocotools (cython) and decord (ffmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake libavcodec-dev libavfilter-dev libavformat-dev \
    libavutil-dev libswscale-dev ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps (torch already in base image, will be upgraded to 2.7+)
COPY server/requirements-runpod.txt requirements.txt

# Install realesrgan + basicsr. basicsr compiles CUDA extensions — use JIT mode
# so they compile at runtime (when GPU is available) not at build time.
ENV BASICSR_JIT=True
ENV TORCH_CUDA_ARCH_LIST="7.0;7.5;8.0;8.6;8.9;9.0"
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server/ server/

# Models download at first cold start via HuggingFace cache.
# HF_TOKEN must be set as env var in RunPod for gated models (SAM3).
ENV HF_HOME=/app/models

CMD ["python3.11", "-u", "server/handler.py"]
