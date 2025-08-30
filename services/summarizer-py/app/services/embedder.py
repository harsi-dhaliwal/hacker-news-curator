import hashlib
import math
import random
from typing import List


def deterministic_embed(text: str, dims: int) -> List[float]:
    """Generate a deterministic pseudo-embedding from input text.
    Suitable for dev without external model calls.
    """
    if not text:
        return [0.0] * dims
    # Seed PRNG from hash of text for determinism
    h = hashlib.sha256(text.encode("utf-8")).digest()
    seed = int.from_bytes(h[:8], "big")
    rng = random.Random(seed)
    # Normal-ish distribution via Box-Muller transform
    vec = []
    for _ in range(dims // 2):
        u1 = max(rng.random(), 1e-12)
        u2 = rng.random()
        r = math.sqrt(-2.0 * math.log(u1))
        theta = 2.0 * math.pi * u2
        z0 = r * math.cos(theta)
        z1 = r * math.sin(theta)
        vec.extend([z0, z1])
    if len(vec) < dims:
        vec.append(rng.uniform(-1, 1))
    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [float(x / norm) for x in vec[:dims]]

