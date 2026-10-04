import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const aligned = length => Math.ceil(length / 4) * 4;

// Repack embedded texture bytes only. Meshopt data, geometry, UVs, rig and materials
// are retained; full-resolution, high-quality WebP copies are prepared separately.
export function replaceModelTextures(bytes, entries, textureDirectory) {
  if (!entries?.length) return bytes;
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Expected GLB');
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const bin = bytes.subarray(28 + jsonLength);
  const replacements = entries.map(entry => {
    const image = json.images[entry.image];
    const view = json.bufferViews[image.bufferView];
    if (view.buffer !== 0 || view.extensions) throw new Error('Expected embedded texture');
    const start = view.byteOffset ?? 0;
    const original = bin.subarray(start, start + view.byteLength);
    const replacement = readFileSync(path.join(textureDirectory, entry.file));
    if (hash(original) !== entry.sourceSha256 || hash(replacement) !== entry.sha256) throw new Error('Texture source changed; regenerate web copies');
    return {entry, view, start, end:start + aligned(view.byteLength), replacement};
  }).sort((a,b) => a.start - b.start);
  const parts = [];
  let cursor = 0;
  for (const part of replacements) {
    if (part.start < cursor || part.end > bin.length) throw new Error('Invalid texture offsets');
    parts.push(bin.subarray(cursor, part.start), part.replacement, Buffer.alloc(aligned(part.replacement.length) - part.replacement.length));
    cursor = part.end;
  }
  parts.push(bin.subarray(cursor));
  const updatedBin = Buffer.concat(parts);
  const relocate = offset => offset + replacements.reduce((delta, part) => delta + (offset >= part.end ? aligned(part.replacement.length) - (part.end - part.start) : 0), 0);
  for (const view of json.bufferViews) {
    if (view.buffer === 0) view.byteOffset = relocate(view.byteOffset ?? 0);
    const compressed = view.extensions?.EXT_meshopt_compression;
    if (compressed?.buffer === 0) compressed.byteOffset = relocate(compressed.byteOffset ?? 0);
  }
  for (const part of replacements) {
    part.view.byteLength = part.replacement.length;
    json.images[part.entry.image].mimeType = 'image/webp';
    for (const texture of json.textures) if (texture.source === part.entry.image) {
      texture.extensions = {...texture.extensions, EXT_texture_webp:{source:texture.source}};
      delete texture.source;
    }
  }
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'EXT_texture_webp'])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), 'EXT_texture_webp'])];
  json.buffers[0].byteLength = updatedBin.length;
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(aligned(text.length), 32); text.copy(padded);
  const header = Buffer.alloc(20);
  header.write('glTF'); header.writeUInt32LE(2,4); header.writeUInt32LE(28+padded.length+updatedBin.length,8);
  header.writeUInt32LE(padded.length,12); header.writeUInt32LE(0x4e4f534a,16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(updatedBin.length); binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header, padded, binHeader, updatedBin]);
}
