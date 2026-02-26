FROM runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python deps (torch already in base image)
COPY server/requirements-runpod.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server/ server/

# Models download at first cold start via HuggingFace cache.
# RunPod caches HF models across workers automatically.
# Set HF_HOME so models persist in the right spot.
ENV HF_HOME=/app/models

CMD ["python3.11", "-u", "server/handler.py"]
