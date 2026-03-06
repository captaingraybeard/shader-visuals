"""Cloudflare R2 upload for point cloud data."""

import os
import uuid
import logging
import boto3
from botocore.config import Config

log = logging.getLogger(__name__)

# R2 config from environment
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY = os.environ.get("R2_ACCESS_KEY", "")
R2_SECRET_KEY = os.environ.get("R2_SECRET_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "shader-visuals")

# Public domain for the bucket (set after enabling public access on the bucket)
# e.g. "pub-abc123.r2.dev" or a custom domain
R2_PUBLIC_DOMAIN = os.environ.get("R2_PUBLIC_DOMAIN", "")

_client = None


def _get_client():
    global _client
    if _client is None:
        if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY]):
            raise RuntimeError(
                "R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY env vars."
            )
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY,
            aws_secret_access_key=R2_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _client


def is_r2_configured() -> bool:
    return all([R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY])


def upload_pointcloud(data: bytes, gen_id: str, compressed: bool = True) -> str:
    """
    Upload point cloud bytes to R2. Returns public URL.
    
    Args:
        data: Raw or compressed point cloud bytes
        gen_id: Generation ID for the filename
        compressed: Whether data is zlib-compressed
    
    Returns:
        Public URL to download the point cloud
    """
    client = _get_client()
    ext = ".bin.zlib" if compressed else ".bin"
    key = f"pointclouds/{gen_id}{ext}"
    content_type = "application/octet-stream"

    client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type,
        # Cache for 24h — point clouds are immutable
        CacheControl="public, max-age=86400",
    )

    if R2_PUBLIC_DOMAIN:
        url = f"https://{R2_PUBLIC_DOMAIN}/{key}"
    else:
        # Generate presigned URL (valid 1h) as fallback
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": key},
            ExpiresIn=3600,
        )

    size_mb = len(data) / (1024 * 1024)
    log.info(f"Uploaded {size_mb:.1f}MB to R2: {key}")
    return url


def upload_image(data: bytes, gen_id: str, name: str) -> str:
    """Upload a PNG image to R2. Returns public URL."""
    client = _get_client()
    key = f"generations/{gen_id}/{name}"
    client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=data,
        ContentType="image/png",
        CacheControl="public, max-age=86400",
    )
    if R2_PUBLIC_DOMAIN:
        url = f"https://{R2_PUBLIC_DOMAIN}/{key}"
    else:
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": R2_BUCKET, "Key": key},
            ExpiresIn=3600,
        )
    log.info(f"Uploaded image to R2: {key}")
    return url


def upload_json(data: dict, gen_id: str, name: str) -> str:
    """Upload a JSON file to R2. Returns public URL."""
    import json
    client = _get_client()
    key = f"generations/{gen_id}/{name}"
    body = json.dumps(data, indent=2).encode()
    client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=body,
        ContentType="application/json",
        CacheControl="public, max-age=86400",
    )
    url = f"https://{R2_PUBLIC_DOMAIN}/{key}" if R2_PUBLIC_DOMAIN else key
    log.info(f"Uploaded JSON to R2: {key}")
    return url


def append_to_index(gen_summary: dict) -> None:
    """Append a generation summary to the R2 index. Downloads existing index, appends, re-uploads."""
    import json
    client = _get_client()
    key = "generations/index.json"

    # Try to fetch existing index
    try:
        resp = client.get_object(Bucket=R2_BUCKET, Key=key)
        index = json.loads(resp["Body"].read())
    except Exception:
        index = []

    index.append(gen_summary)

    client.put_object(
        Bucket=R2_BUCKET,
        Key=key,
        Body=json.dumps(index, indent=2).encode(),
        ContentType="application/json",
        CacheControl="public, max-age=60",  # short cache so new entries show up
    )
    log.info(f"Updated R2 index: {len(index)} generations")
