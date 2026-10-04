import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replaceModelTextures} from '../scripts/web-model-textures.mjs';

function parse(bytes) {
  const length = bytes.readUInt32LE(12);
  return {json:JSON.parse(bytes.toString('utf8',20,20+length)), bin:bytes.subarray(28+length)};
}
const directory = 'assets/web-textures';
const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, 'utf8'));
for (const [url, entries] of Object.entries(manifest)) test(`${url}: smaller textures preserve all geometry, rig and material data`, () => {
  const original = readFileSync(`public${url}`);
  const packed = replaceModelTextures(original, entries, directory);
  assert.ok(packed.length < original.length);
  assert.equal(packed.readUInt32LE(8), packed.length);
  const source = parse(original), output = parse(packed);
  const imageViews = new Set(source.json.images.map(image => image.bufferView));
  for (const key of ['accessors','meshes','nodes','skins','animations','scenes','scene','materials']) assert.deepEqual(output.json[key], source.json[key],key);
  for (const [index, view] of source.json.bufferViews.entries()) {
    if (imageViews.has(index)) continue;
    const oldData = view.extensions?.EXT_meshopt_compression ?? view;
    const newData = output.json.bufferViews[index].extensions?.EXT_meshopt_compression ?? output.json.bufferViews[index];
    assert.equal(oldData.buffer,0);
    assert.equal(newData.byteLength,oldData.byteLength);
    assert.deepEqual(output.bin.subarray(newData.byteOffset ?? 0,(newData.byteOffset ?? 0)+newData.byteLength), source.bin.subarray(oldData.byteOffset ?? 0,(oldData.byteOffset ?? 0)+oldData.byteLength),`geometry buffer ${index}`);
  }
  for (const entry of entries) {
    const image = output.json.images[entry.image], view = output.json.bufferViews[image.bufferView];
    assert.equal(image.mimeType,'image/webp');
    assert.deepEqual(output.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength),readFileSync(`${directory}/${entry.file}`));
    assert.ok(output.json.textures.some(t=>t.extensions?.EXT_texture_webp?.source===entry.image));
  }
  assert.ok(output.json.extensionsRequired.includes('EXT_texture_webp'));
  const changed = structuredClone(entries); changed[0].sourceSha256 = 'bad';
  assert.throws(()=>replaceModelTextures(original,changed,directory),/Texture source changed/);
});
