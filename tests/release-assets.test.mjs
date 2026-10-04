import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {experiences, tracks} from '../src/content.ts';
import {developmentOnlyModels} from '../scripts/release-assets.mjs';
import {modelTransportManifest, SINGLE_FILE_LIMIT} from '../scripts/model-chunks.mjs';
import {replaceModelTextures} from '../scripts/web-model-textures.mjs';
import {optimizeModelGeometry} from '../scripts/web-model-geometry.mjs';
import {webImage} from '../src/web-images.ts';
import {gunzipSync} from 'node:zlib';

function transportedBytes(transport){
  if(transport.bundle){
    const bytes=transportedBytes(transport.bundle.transport);
    return bytes.subarray(transport.bundle.byteOffset,transport.bundle.byteOffset+transport.byteLength);
  }
  const bytes=Buffer.concat(transport.chunks.map(chunk=>readFileSync('dist/client'+chunk.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),transport.sha256);
  return bytes;
}

test('release excludes full reference models while preserving local originals',()=>{
  for(const file of developmentOnlyModels){
    // The publishing checkout intentionally excludes private/full reference models.
    assert.equal(existsSync(`dist/client/${file}`),false,`do not publish ${file}`);
  }
});

test('production includes each current model, content image, header and stylesheet asset',async ()=>{
  const art=JSON.parse(readFileSync('src/art-source.json'));
  const header=JSON.parse(readFileSync('src/header-art.json'));
  const transports=JSON.parse(readFileSync(`dist/client/${modelTransportManifest}`));
  const webTextures=JSON.parse(readFileSync('assets/web-textures/manifest.json'));
  const urls=new Set([art.displayModel,art.displayJarBase,art.displayLid,'/assets/knit/flowers.glb','/assets/knit/hoho-tag.png','/assets/knit/ground-knit.png','/assets/knit/ivory-knit.png','/assets/chapters/music.png']);
  for(const h of Object.values(header))urls.add(h.src);
  for(const item of experiences){urls.add(item.image);for(const e of item.entries){urls.add(e.art);if(e.pin)urls.add(e.pin.image);}}
  for(const track of tracks)urls.add(track.art);
  for(const file of ['src/styles.css','src/SceneLoading.tsx','index.html'])for(const match of readFileSync(file,'utf8').matchAll(/\/assets\/[^'"\s)]+/g))urls.add(match[0]);
  for(const url of urls){
    if(!transports[url]){assert.ok(existsSync(`dist/client${webImage(url)}`),url);continue;}
    assert.equal(existsSync(`dist/client${url}`),false,'oversized whole GLB is not published');
    const transport=transports[url];
    const delivered=transportedBytes(transport);
    const whole=createHash('sha256');
    let offset=0;
    for(const chunk of transport.chunks){
      assert.equal(chunk.byteOffset,offset);
      const bytes=delivered.subarray(chunk.byteOffset,chunk.byteOffset+chunk.byteLength);
      assert.equal(bytes.byteLength,chunk.byteLength);
      assert.ok(bytes.byteLength<SINGLE_FILE_LIMIT);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),chunk.sha256);
      whole.update(bytes);offset+=bytes.byteLength;
    }
    assert.equal(offset,transport.byteLength);
    assert.equal(whole.digest('hex'),transport.sha256);
    const textured=replaceModelTextures(readFileSync(`public${url}`),webTextures[url],'assets/web-textures');
    const {bytes:webModel}=await optimizeModelGeometry(textured,url);
    assert.deepEqual(transport.encoding?gunzipSync(delivered):delivered,webModel,'transport preserves prepared GLB bytes');
    assert.equal(createHash('sha256').update(webModel).digest('hex'),transport.decodedSha256??transport.sha256);
  }
  for(const url of [art.displayModel,art.displayJarBase,art.displayLid]){
    if(statSync(`public${url}`).size>SINGLE_FILE_LIMIT)assert.ok(transports[url],url);
  }
});


test('web image copies match the audited files and preserve authored originals',()=>{
  const images=JSON.parse(readFileSync('assets/web-images-report.json'));
  for(const image of images){
    const original=readFileSync(`public${image.source}`);
    const published=readFileSync(`dist/client${webImage(image.source)}`);
    assert.equal(createHash('sha256').update(original).digest('hex'),image.sourceSha256);
    assert.equal(createHash('sha256').update(published).digest('hex'),image.sha256);
    assert.equal(published.length,image.bytes);
    assert.ok(published.length<original.length);
    assert.equal(existsSync(`dist/client${image.source}`),false);
  }
});

test('opening image bundle restores every image byte and replaces individual preload requests',()=>{
  const pack=JSON.parse(readFileSync('dist/client/.build-evidence/opening-images.json'));
  const bytes=transportedBytes(pack.transport);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pack.transport.sha256);
  let offset=0;
  for(const entry of pack.entries){
    assert.equal(entry.byteOffset,offset);
    assert.deepEqual(bytes.subarray(offset,offset+entry.byteLength),readFileSync('dist/client'+entry.url));
    offset+=entry.byteLength;
  }
  assert.equal(offset,bytes.length);
  const html=readFileSync('dist/client/index.html','utf8');
  for(const chunk of (pack.transport.bundle?.transport??pack.transport).chunks)assert.ok(html.includes(`as="fetch" href="${chunk.url}"`));
  for(const entry of pack.entries)assert.ok(!html.includes(`as="image" href="${entry.url}"`));
});

test('startup code and styles arrive with HTML and the scene download is discovered first',()=>{
  const html=readFileSync('dist/client/index.html','utf8');
  assert.match(html,/<script type="module" data-build="index-[^"]+\.js">/);
  assert.doesNotMatch(html,/<script[^>]+src=/);
  assert.doesNotMatch(html,/<link[^>]+rel="(?:stylesheet|modulepreload)"/);
  assert.ok(html.indexOf('as="fetch"')<html.indexOf('<script type="module"'));
  assert.match(html,/<style>/);
});
