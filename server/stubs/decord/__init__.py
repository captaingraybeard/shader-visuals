"""Stub decord module — satisfies import but we never actually decode video."""

def cpu(idx=0):
    return idx

class VideoReader:
    def __init__(self, *args, **kwargs):
        raise RuntimeError("decord stub: video decoding not supported in this deployment")
