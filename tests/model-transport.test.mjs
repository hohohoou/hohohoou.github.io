import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createChunkPlan, createCompressedModelPlan, SINGLE_FILE_LIMIT, MODEL_CHUNK_SIZE, modelTransportModule} from '../scripts/model-chunks.mjs';
import {omitDevelopmentModels} from '../scripts/release-assets.mjs';
import {fetchModelTransport, installModelTransports} from '../src/model-transport.ts';

function fixture() {
  const bytes = Buffer.from('a small lossless model transport fixture');
  return {bytes, ...createChunkPlan(bytes, '/assets/example.glb', 9)};
}
function responseFor(asset) {
  // Deliberately vary stream boundaries independently from transport chunks.
  return new Response(new ReadableStream({start(controller) {
    controller.enqueue(new Uint8Array(asset.source.subarray(0, 2)));
    controller.enqueue(new Uint8Array(asset.source.subarray(2)));
    controller.close();
  }}));
}
function assetFetch(assets) {
  return async url => responseFor(assets.find(asset => '/' + asset.fileName === url));
}

test('concurrent models share one verified opening bundle and restore exact bytes',async()=>{
  const first=createCompressedModelPlan(Buffer.from('first model'.repeat(100)),'/assets/first.glb');
  const second=createCompressedModelPlan(Buffer.from('second model'.repeat(150)),'/assets/second.glb');
  const combined=createChunkPlan(Buffer.concat([...first.assets,...second.assets].map(a=>a.source)),'/assets/opening.glb');
  first.transport.bundle={transport:combined.transport,byteOffset:0};
  second.transport.bundle={transport:combined.transport,byteOffset:first.transport.byteLength};
  let requests=0;
  const options={fetcher:async url=>{requests++;return assetFetch(combined.assets)(url);}};
  const [a,b]=await Promise.all([fetchModelTransport(first.transport,options),fetchModelTransport(second.transport,options)]);
  assert.equal(requests,1);
  assert.deepEqual(Buffer.from(a),Buffer.from('first model'.repeat(100)));
  assert.deepEqual(Buffer.from(b),Buffer.from('second model'.repeat(150)));
  await assert.rejects(fetchModelTransport({...first.transport,bundle:{...first.transport.bundle,byteOffset:-1}},options),/bundle range/);
  await assert.rejects(fetchModelTransport({...second.transport,chunks:second.transport.chunks.map(c=>({...c,sha256:'0'.repeat(64)}))},options),/integrity/);
});

test('opening sections decode during download while the final section waits for EOF',async()=>{
  const a=createChunkPlan(Buffer.from('early texture section'),'/assets/early.glb');
  const b=createChunkPlan(Buffer.from('final model section'),'/assets/final.glb');
  const combined=createChunkPlan(Buffer.concat([...a.assets,...b.assets].map(x=>x.source)),'/assets/streamed.glb');
  a.transport.bundle={transport:combined.transport,byteOffset:0};
  b.transport.bundle={transport:combined.transport,byteOffset:a.transport.byteLength};
  let controller;
  const options={fetcher:async()=>new Response(new ReadableStream({start(c){controller=c;c.enqueue(a.assets[0].source);}}))};
  let finalResolved=false;
  const first=fetchModelTransport(a.transport,options);
  const last=fetchModelTransport(b.transport,options).then(data=>{finalResolved=true;return data;});
  assert.deepEqual(Buffer.from(await first),a.assets[0].source);
  assert.equal(finalResolved,false);
  controller.enqueue(b.assets[0].source);controller.close();
  assert.deepEqual(Buffer.from(await last),b.assets[0].source);
});

test('compressed transport restores exact bytes with native and fallback decoders',async t=>{
  const bytes=Buffer.from('model payload with repeated geometry data;'.repeat(200));
  const {transport,assets}=createCompressedModelPlan(bytes,'/assets/example.glb');
  assert.ok(transport.byteLength<bytes.length/4);
  assert.deepEqual(Buffer.from(await fetchModelTransport(transport,{fetcher:assetFetch(assets)})),bytes);
  const native=globalThis.DecompressionStream;
  try {
    globalThis.DecompressionStream=undefined;
    assert.deepEqual(Buffer.from(await fetchModelTransport(transport,{fetcher:assetFetch(assets)})),bytes);
  } finally {globalThis.DecompressionStream=native;}
  await assert.rejects(fetchModelTransport({...transport,decodedByteLength:bytes.length+1},{fetcher:assetFetch(assets)}),/Decoded model length/);
  await assert.rejects(fetchModelTransport({...transport,decodedSha256:'0'.repeat(64)},{fetcher:assetFetch(assets)}),/Decoded model integrity/);
});

test('transport slices preserve every byte and produce content-addressed assets', async () => {
  const {bytes, transport, assets} = fixture();
  assert.deepEqual(Buffer.concat(assets.map(asset => asset.source)), bytes);
  assert.equal(transport.sha256, createHash('sha256').update(bytes).digest('hex'));
  for (const chunk of transport.chunks) assert.ok(chunk.url.includes(chunk.sha256));
  let previous = 0;
  const assembled = await fetchModelTransport(transport, {
    fetcher:assetFetch(assets),
    onProgress(loaded, total) {assert.ok(loaded > previous); assert.equal(total, bytes.byteLength); previous = loaded;},
  });
  assert.deepEqual(Buffer.from(assembled), bytes);
  assert.equal(previous, bytes.byteLength);
});

test('a changed chunk gets a new content hash and transport URL', () => {
  const first = fixture();
  const changed = Buffer.from(first.bytes);
  changed[0] ^= 1;
  const second = createChunkPlan(changed, '/assets/example.glb', 9);
  assert.notEqual(first.transport.chunks[0].url, second.transport.chunks[0].url);
  assert.equal(first.transport.chunks[1].url, second.transport.chunks[1].url);
});

test('content-addressed models reuse browser cache; changed bytes select new URLs', async () => {
  const first = fixture();
  const cache = new Map();
  let downloaded = 0;
  const fetcher = async (url, init) => {
    assert.equal(init.cache, 'force-cache');
    if (!cache.has(url)) {downloaded++; cache.set(url, first.assets.find(asset => '/' + asset.fileName === url));}
    return responseFor(cache.get(url));
  };
  await fetchModelTransport(first.transport, {fetcher});
  await fetchModelTransport(first.transport, {fetcher});
  assert.equal(downloaded, first.assets.length);
  await fetchModelTransport(first.transport, {requestInit:{cache:'reload'}, fetcher:async (url, init) => {
    assert.equal(init.cache,'reload');
    return responseFor(cache.get(url));
  }});
});

test('build plugin splits only eligible production GLBs and deletes only output originals', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hoho-chunk-build-test-'));
  try {
    const publicDir = path.join(root, 'public');
    const output = path.join(root, 'dist');
    mkdirSync(path.join(publicDir, 'assets/knit'), {recursive:true});
    mkdirSync(path.join(output, 'assets/knit'), {recursive:true});
    const big = Buffer.alloc(SINGLE_FILE_LIMIT + 1, 87);
    writeFileSync(path.join(publicDir, 'assets/knit/model.glb'), big);
    writeFileSync(path.join(publicDir, 'assets/knit/small.glb'), 'small');
    writeFileSync(path.join(publicDir, 'assets/knit/hoho-knit.glb'), big);
    writeFileSync(path.join(output, 'assets/knit/model.glb'), 'output original marker');
    writeFileSync(path.join(output, 'assets/knit/hoho-knit.glb'), 'output original marker');
    writeFileSync(path.join(output, 'assets/knit/small.glb'), 'small');
    const plugin = omitDevelopmentModels();
    const emitted = [];
    plugin.configResolved({command:'build', publicDir});
    await plugin.buildStart.call({emitFile(asset) {emitted.push(asset);}});
    const mapping = JSON.parse(plugin.load(plugin.resolveId(modelTransportModule)).replace(/^export default /, '').replace(/;$/, ''));
    assert.deepEqual(Object.keys(mapping), ['/assets/knit/model.glb']);
    assert.equal(mapping['/assets/knit/model.glb'].chunks.length, 2);
    assert.equal(mapping['/assets/knit/model.glb'].chunks[0].byteLength, MODEL_CHUNK_SIZE);
    assert.ok(emitted.every(asset => Buffer.byteLength(asset.source) < SINGLE_FILE_LIMIT));
    const chunks = emitted.filter(asset => asset.fileName.endsWith('.bin'));
    assert.deepEqual(Buffer.concat(chunks.map(asset => asset.source)), big);
    plugin.writeBundle({dir:output});
    assert.equal(existsSync(path.join(output, 'assets/knit/model.glb')), false);
    assert.equal(existsSync(path.join(output, 'assets/knit/hoho-knit.glb')), false);
    assert.equal(readFileSync(path.join(output, 'assets/knit/small.glb'), 'utf8'), 'small');
    assert.equal(readFileSync(path.join(publicDir, 'assets/knit/model.glb')).byteLength, big.byteLength);
    assert.equal(readFileSync(path.join(publicDir, 'assets/knit/hoho-knit.glb')).byteLength, big.byteLength);
  } finally {rmSync(root, {recursive:true, force:true});}
});

test('dev transport mapping is empty and no chunks are emitted', async () => {
  const plugin = omitDevelopmentModels();
  plugin.configResolved({command:'serve', publicDir:'/not-read'});
  await plugin.buildStart.call({emitFile() {throw new Error('must not emit in dev');}});
  assert.equal(plugin.load(plugin.resolveId(modelTransportModule)), 'export default {};');
});

test('rejects invalid offsets before downloading or allocating a model', async () => {
  const {transport} = fixture();
  transport.chunks[1].byteOffset++;
  await assert.rejects(fetchModelTransport(transport, {fetcher() {throw new Error('must not fetch');}}), /Invalid model transport chunk/);
});

test('rejects truncated, oversized, and same-length corrupted chunks', async t => {
  for (const kind of ['short', 'long', 'corrupt']) await t.test(kind, async () => {
    const {transport, assets} = fixture();
    await assert.rejects(fetchModelTransport(transport, {fetcher:async url => {
      const asset = assets.find(item => '/' + item.fileName === url);
      const bytes = Buffer.from(asset.source);
      if (kind === 'short') return new Response(bytes.subarray(1));
      if (kind === 'long') return new Response(Buffer.concat([bytes, Buffer.from([0])]));
      bytes[0] ^= 1;
      return new Response(bytes);
    }}), kind === 'short' ? /shorter/ : kind === 'long' ? /longer/ : /integrity/);
  });
});

test('a failed chunk aborts its outstanding sibling, with at most two requests', async () => {
  const {transport} = fixture();
  let requests = 0;
  let aborted = false;
  await assert.rejects(fetchModelTransport(transport, {fetcher:async (_url, {signal}) => {
    requests++;
    if (requests === 1) return new Response('', {status:404});
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      aborted = true;
      reject(new Error('aborted sibling'));
    }, {once:true}));
  }}), /404/);
  assert.equal(requests, 2);
  assert.equal(aborted, true);
});

function fakeLoader(parse) {
  const events = [];
  return {events, path:'', resourcePath:'', requestHeader:{}, withCredentials:false,
    manager:{itemStart:url => events.push(['start',url]), itemEnd:url => events.push(['end',url]), itemError:url => events.push(['error',url]), resolveURL:url => url},
    load(url, onLoad) {events.push(['original',url]); onLoad('original');},
    parse,
  };
}
function load(loader, url) {return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));}

test('wrapper preserves URL, parse base, repeated setup, and original loader for ordinary assets', async t => {
  const {bytes, transport, assets} = fixture();
  t.mock.method(globalThis, 'fetch', assetFetch(assets));
  const loader = fakeLoader((data, base, onLoad) => {
    assert.deepEqual(Buffer.from(data), bytes);
    assert.equal(base, '/assets/');
    onLoad('parsed');
  });
  const mapping = {'/assets/example.glb':transport};
  installModelTransports(loader, mapping);
  installModelTransports(loader, mapping);
  assert.equal(await load(loader, '/assets/example.glb'), 'parsed');
  assert.deepEqual(loader.events, [['start','/assets/example.glb'], ['end','/assets/example.glb']]);
  assert.equal(await load(loader, '/other.glb'), 'original');
  assert.deepEqual(loader.events.at(-1), ['original','/other.glb']);
});

test('download and parse failures notify error callback and settle LoadingManager exactly once', async t => {
  for (const kind of ['download', 'parse']) await t.test(kind, async child => {
    const {transport, assets} = fixture();
    child.mock.method(globalThis, 'fetch', kind === 'download' ? async () => new Response('', {status:503}) : assetFetch(assets));
    const loader = fakeLoader((_data, _base, _onLoad, onError) => onError(new Error('parse failed')));
    installModelTransports(loader, {'/assets/example.glb':transport});
    await assert.rejects(load(loader, '/assets/example.glb'), kind === 'download' ? /503/ : /parse failed/);
    assert.deepEqual(loader.events, [['start','/assets/example.glb'], ['error','/assets/example.glb'], ['end','/assets/example.glb']]);
  });
});

test('the installed three-stdlib GLTFLoader parses reconstructed GLB bytes', async t => {
  const requireFromDrei = createRequire(import.meta.resolve('@react-three/drei'));
  const {GLTFLoader} = requireFromDrei('three-stdlib');
  const json = Buffer.from(JSON.stringify({asset:{version:'2.0'}, scenes:[{nodes:[]}], scene:0}));
  const jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const glb = Buffer.alloc(20 + jsonLength, 32);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(jsonLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  const {transport, assets} = createChunkPlan(glb, '/assets/minimal.glb', 17);
  t.mock.method(globalThis, 'fetch', assetFetch(assets));
  const loader = new GLTFLoader();
  installModelTransports(loader, {'/assets/minimal.glb':transport});
  const result = await load(loader, '/assets/minimal.glb');
  assert.equal(result.scene.isGroup, true);
  assert.equal(result.parser.json.asset.version, '2.0');
  assert.deepEqual(result.parser.json.scenes, [{nodes:[]}]);
});
