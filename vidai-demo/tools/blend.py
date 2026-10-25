"""Average motion-blur sub-frames into final frames (jobs listed in a JSON file)."""
import json
import sys

import numpy as np
from PIL import Image

jobs = json.load(open(sys.argv[1]))
for job in jobs:
    acc = None
    for p in job["parts"]:
        a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
        acc = a if acc is None else acc + a
    img = (acc / len(job["parts"])).round().clip(0, 255).astype(np.uint8)
    Image.fromarray(img).save(job["out"], quality=94)
print(f"blended {len(jobs)} frames")
