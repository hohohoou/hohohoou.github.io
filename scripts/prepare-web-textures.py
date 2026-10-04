"""Build screen-sized model textures without changing the authored GLBs."""
from PIL import Image
import json, struct, io, pathlib, hashlib
import numpy as np

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'assets/web-textures'
out.mkdir(parents=True, exist_ok=True)
# Color / roughness-metalness / tangent normal. Eye meshes use their own materials.
profiles = {
    'hoho-eye-rig-display': [(2560, 92), (1024, 90), (2560, 95)],
    'lid-knit-display': [(768, 84), (256, 85), (768, 90)],
    'jar-base-display': [(768, 84), (256, 90), (512, 90)],
}
manifest, report = {}, []
for name, profile in profiles.items():
    b = (root / f'public/assets/knit/{name}.glb').read_bytes()
    n = struct.unpack_from('<I', b, 12)[0]
    gltf = json.loads(b[20:20+n])
    entries = []
    for i, image in enumerate(gltf['images']):
        view = gltf['bufferViews'][image['bufferView']]
        start = 28 + n + view.get('byteOffset', 0)
        original = b[start:start + view['byteLength']]
        im = Image.open(io.BytesIO(original)).convert('RGB')
        source_size = im.size
        limit, quality = profile[i]
        im.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        if i == 2:
            # Restore unit tangent normals after averaging, preserving orientation.
            normals = np.asarray(im, dtype=np.float32) / 127.5 - 1
            normals /= np.maximum(np.linalg.norm(normals, axis=2, keepdims=True), 1e-6)
            im = Image.fromarray(np.clip((normals + 1) * 127.5, 0, 255).astype('uint8'))
        encoded = io.BytesIO()
        im.save(encoded, format='WEBP', quality=quality, method=6)
        data = encoded.getvalue()
        filename = f'{name}-{i}.webp'
        (out / filename).write_bytes(data)
        entry = dict(image=i, file=filename, sourceSha256=hashlib.sha256(original).hexdigest(),
                     sha256=hashlib.sha256(data).hexdigest(), width=im.width, height=im.height)
        entries.append(entry)
        report.append(dict(model=name, **entry, sourceWidth=source_size[0], sourceHeight=source_size[1],
                           originalBytes=len(original), webBytes=len(data), quality=quality))
    manifest[f'/assets/knit/{name}.glb'] = entries
    print(name, sum(r['webBytes'] for r in report if r['model'] == name), flush=True)
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
