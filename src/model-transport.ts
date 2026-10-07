import type {useGLTF} from '@react-three/drei';
import {loadingPhase} from './loading-metrics.ts';

export interface ModelChunk {url: string; byteOffset: number; byteLength: number; sha256: string}
export interface ModelTransport {byteLength: number; sha256: string; chunks: ModelChunk[]; encoding?: 'gzip'; decodedByteLength?: number; decodedSha256?: string; bundle?: {transport:ModelTransport; byteOffset:number}}
export type ModelTransports = Record<string, ModelTransport>;
type CompatibleLoader = Parameters<NonNullable<Parameters<typeof useGLTF>[3]>>[0];
interface TransferOptions {
  fetcher?: typeof fetch;
  requestInit?: RequestInit;
  resolveURL?: (url: string) => string;
  onProgress?: (loaded: number, total: number) => void;
  onBytes?: (bytes:Uint8Array,loaded:number) => void;
  stallTimeoutMs?: number;
  retryDelayMs?: number;
}

function validateTransport(transport: ModelTransport) {
  let offset = 0;
  if (!Number.isSafeInteger(transport.byteLength) || transport.byteLength < 1 || !transport.chunks.length) {
    throw new Error('Invalid model transport length');
  }
  for (const chunk of transport.chunks) {
    if (chunk.byteOffset !== offset || !Number.isSafeInteger(chunk.byteLength) || chunk.byteLength < 1 || chunk.byteLength > 16 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(chunk.sha256)) {
      throw new Error('Invalid model transport chunk');
    }
    offset += chunk.byteLength;
  }
  if (offset !== transport.byteLength) throw new Error('Model transport length mismatch');
  if (transport.bundle) {
    const {transport:container,byteOffset}=transport.bundle;
    if (container.bundle || container.encoding || !Number.isSafeInteger(byteOffset) || byteOffset<0 || byteOffset+transport.byteLength>container.byteLength) throw new Error('Invalid model bundle range');
    validateTransport(container);
  }
  if (transport.encoding && (transport.encoding !== 'gzip' || !Number.isSafeInteger(transport.decodedByteLength) || transport.decodedByteLength! < 1 || !/^[a-f0-9]{64}$/.test(transport.decodedSha256 ?? ''))) throw new Error('Invalid compressed model transport');
}

// The content-addressed opening bundle is shared by all models and textures.
// Share one download per page, even when GLTF and image loading overlap.
interface BundleDownload {bytes?:Uint8Array;loaded:number;complete:boolean;error?:unknown;listeners:Set<()=>void>}
const bundles=new Map<string,BundleDownload>();
function fetchBundleSlice(transport:ModelTransport,start:number,length:number,options:TransferOptions):Promise<Uint8Array> {
  const key=transport.sha256+'|'+(options.resolveURL?.(transport.chunks[0].url)??transport.chunks[0].url);
  let download=bundles.get(key);
  if(!download){
    download={loaded:0,complete:false,listeners:new Set()};
    bundles.set(key,download);
    const state=download,notify=()=>{for(const listener of [...state.listeners])listener();};
    void fetchModelTransport(transport,{...options,onProgress:undefined,onBytes:(bytes,loaded)=>{state.bytes=bytes;state.loaded=loaded;notify();}}).then(
      ()=>{state.complete=true;notify();},
      error=>{state.error=error;bundles.delete(key);notify();},
    );
  }
  const state=download;
  return new Promise((resolve,reject)=>{
    const check=()=>{
      if(state.error){state.listeners.delete(check);reject(state.error);}
      // Early sections still pass their individual SHA checks below. The last
      // section waits for EOF and the shared file's complete integrity check.
      else if(state.bytes && state.loaded>=start+length && (start+length<transport.byteLength || state.complete)){
        state.listeners.delete(check);resolve(state.bytes.subarray(start,start+length));
      }
    };
    state.listeners.add(check);check();
  });
}

export async function fetchModelTransport(transport: ModelTransport, options: TransferOptions = {}): Promise<ArrayBuffer> {
  validateTransport(transport);
  const bytes = new Uint8Array(new ArrayBuffer(transport.byteLength));
  const abort = new AbortController();
  const fetcher = options.fetcher ?? fetch;
  let next = 0;
  let loaded = 0;
  let contiguous = 0;
  const verified = transport.chunks.map(() => false);
  const stallTimeoutMs = options.stallTimeoutMs ?? 15000;
  const retryDelayMs = options.retryDelayMs ?? 250;

  const downloadChunk = async (chunk: ModelChunk) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (abort.signal.aborted) throw new Error('Model download cancelled');
      const request = new AbortController();
      const cancel = () => request.abort();
      abort.signal.addEventListener('abort', cancel, {once:true});
      let stalled = false;
      let timer: ReturnType<typeof setTimeout>;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let retryable = true;
      const touch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {stalled = true; request.abort();}, stallTimeoutMs);
      };
      try {
        touch();
        const cache = chunk.url.includes(`.${chunk.sha256}.`) ? 'force-cache' : 'default';
        const response = await fetcher(options.resolveURL?.(chunk.url) ?? chunk.url, {
          cache, ...options.requestInit, ...(attempt ? {cache:'reload' as RequestCache} : {}), signal:request.signal,
        });
        if (!response.ok || !response.body) {
          retryable = response.status === 408 || response.status === 429 || response.status >= 500;
          await response.body?.cancel();
          throw new Error(`Model chunk request failed: ${response.status}`);
        }
        reader = response.body.getReader();
        let received = 0;
        for (;;) {
          const {value, done} = await reader.read();
          if (done) break;
          if (received + value.byteLength > chunk.byteLength) {
            retryable = false;
            throw new Error('Model chunk is longer than expected');
          }
          bytes.set(value, chunk.byteOffset + received);
          received += value.byteLength;
          touch();
          // Legacy single-file transports retain their streaming decode path.
          // Parallel transports expose only a contiguous, verified prefix below.
          if (transport.chunks.length === 1) options.onBytes?.(bytes, received);
        }
        clearTimeout(timer!);
        if (received !== chunk.byteLength) throw new Error('Model chunk is shorter than expected');
        const hash = await crypto.subtle.digest('SHA-256', bytes.subarray(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
        const hex = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
        if (hex !== chunk.sha256) throw new Error('Model chunk integrity check failed');
        return;
      } catch (error) {
        if (reader) await reader.cancel().catch(() => {});
        if (abort.signal.aborted || !retryable || attempt === 2) {
          throw stalled ? new Error('Model chunk download stalled') : error;
        }
      } finally {
        clearTimeout(timer!);
        abort.signal.removeEventListener('abort', cancel);
        reader?.releaseLock();
      }
      await new Promise(resolve => setTimeout(resolve, retryDelayMs * (attempt + 1)));
    }
  };

  const consume = async () => {
    while (next < transport.chunks.length) {
      if (abort.signal.aborted) throw new Error('Model download cancelled');
      const index = next++;
      const chunk = transport.chunks[index];
      if (transport.bundle) {
        const start = transport.bundle.byteOffset + chunk.byteOffset;
        const source = await fetchBundleSlice(transport.bundle.transport, start, chunk.byteLength, options);
        bytes.set(source, chunk.byteOffset);
        const hash = await crypto.subtle.digest('SHA-256', bytes.subarray(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
        if (Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('') !== chunk.sha256) {
          throw new Error('Model chunk integrity check failed');
        }
      } else {
        await downloadChunk(chunk);
      }
      loaded += chunk.byteLength;
      options.onProgress?.(loaded, transport.byteLength);
      verified[index] = true;
      while (contiguous < verified.length && verified[contiguous]) contiguous++;
      if (contiguous) {
        const last = transport.chunks[contiguous - 1];
        options.onBytes?.(bytes, last.byteOffset + last.byteLength);
      }
    }
  };
  try {
    await Promise.all(Array.from({length:Math.min(4, transport.chunks.length)}, consume));
    if (transport.chunks.length > 1) {
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      if (Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('') !== transport.sha256) {
        throw new Error('Model transport integrity check failed');
      }
    }
    if (!transport.encoding) return bytes.buffer;
    const decoded = typeof DecompressionStream !== 'undefined'
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
      : (await import('three/addons/libs/fflate.module.js')).gunzipSync(bytes).slice().buffer as ArrayBuffer;
    if (decoded.byteLength !== transport.decodedByteLength) throw new Error('Decoded model length mismatch');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', decoded));
    if (Array.from(digest, value => value.toString(16).padStart(2, '0')).join('') !== transport.decodedSha256) throw new Error('Decoded model integrity check failed');
    return decoded;
  } catch (error) {
    abort.abort();
    throw error;
  }
}

const wrappedLoaders = new WeakSet<CompatibleLoader>();

export function installModelTransports(loader: CompatibleLoader, transports: ModelTransports) {
  if (wrappedLoaders.has(loader) || !Object.keys(transports).length) return;
  wrappedLoaders.add(loader);
  const originalLoad = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    const transport = transports[url];
    if (!transport || loader.path) return originalLoad(url, onLoad, onProgress, onError);
    loader.manager.itemStart(url);
    let finished = false;
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      try {
        // three-stdlib types this as ErrorEvent, but its own loader also passes Error.
        if (onError) onError(error as ErrorEvent);
        else console.error(error);
      } finally {
        loader.manager.itemError(url);
        loader.manager.itemEnd(url);
      }
    };
    void fetchModelTransport(transport, {
      requestInit: {headers:loader.requestHeader, credentials:loader.withCredentials ? 'include' : 'same-origin'},
      resolveURL: value => loader.manager.resolveURL(value),
      onProgress: onProgress ? (loaded, total) => onProgress(new ProgressEvent('progress', {lengthComputable:true, loaded, total})) : undefined,
    }).then(data => {
      loadingPhase(`download:${url}`);
      const resourcePath = loader.resourcePath || url.slice(0, url.lastIndexOf('/') + 1);
      loader.parse(data, resourcePath, result => {
        if (finished) return;
        loadingPhase(`parsed:${url}`);
        onLoad(result);
        finished = true;
        loader.manager.itemEnd(url);
      }, fail);
    }).catch(fail);
  };
}
