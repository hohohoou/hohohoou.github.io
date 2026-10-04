import {createHash} from 'node:crypto';
import path from 'node:path';
import {gzipSync} from 'node:zlib';

export const SINGLE_FILE_LIMIT = 25 * 1024 * 1024;
export const MODEL_CHUNK_SIZE = 16 * 1024 * 1024;
export const modelTransportModule = 'virtual:hoho-model-transports';
export const resolvedModelTransportModule = '\0' + modelTransportModule;
export const modelTransportManifest = '.build-evidence/model-transports.json';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Slice transport bytes only: never parse, optimize, or rewrite a GLB.
export function createChunkPlan(bytes, url, chunkSize = MODEL_CHUNK_SIZE) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize >= SINGLE_FILE_LIMIT) {
    throw new Error('Model chunk size must be below the single-file limit');
  }
  const chunks = [];
  const assets = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const source = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength));
    const sha256 = digest(source);
    const name = path.posix.basename(url, '.glb');
    const fileName = `${path.posix.dirname(url).slice(1)}/${name}.${sha256}.part-${chunks.length}.bin`;
    chunks.push({url: '/' + fileName, byteOffset: offset, byteLength: source.byteLength, sha256});
    assets.push({type: 'asset', fileName, source});
  }
  return {transport: {byteLength: bytes.byteLength, sha256: digest(bytes), chunks}, assets};
}

export function createCompressedModelPlan(bytes,url) {
  const compressed=gzipSync(bytes,{level:9});
  const plan=createChunkPlan(compressed,url);
  Object.assign(plan.transport,{encoding:'gzip',decodedByteLength:bytes.byteLength,decodedSha256:digest(bytes)});
  return plan;
}
