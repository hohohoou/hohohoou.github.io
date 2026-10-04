import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGlb,decodeView} from '../scripts/web-model-geometry.mjs';
import {replaceModelTextures} from '../scripts/web-model-textures.mjs';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import {gunzipSync} from 'node:zlib';

const transports=JSON.parse(readFileSync('dist/client/.build-evidence/model-transports.json'));
const textures=JSON.parse(readFileSync('assets/web-textures/manifest.json'));
function deliveredBytes(transport){
  if(transport.bundle){
    const {transport:container,byteOffset}=transport.bundle;
    return deliveredBytes(container).subarray(byteOffset,byteOffset+transport.byteLength);
  }
  return Buffer.concat(transport.chunks.map(chunk=>readFileSync('dist/client'+chunk.url)));
}
for(const [url,entries] of Object.entries(textures))test(`${url}: delivered model keeps eye rigs/materials/textures and valid geometry`,async()=>{
  const sourceBytes=replaceModelTextures(readFileSync(`public${url}`),entries,'assets/web-textures');
  const source=parseGlb(sourceBytes);
  const delivered=deliveredBytes(transports[url]);
  const bytes=transports[url].encoding?gunzipSync(delivered):delivered;
  const output=parseGlb(bytes);
  assert.ok(bytes.length<sourceBytes.length*.75);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  for(const key of ['nodes','skins','animations','scenes','scene','materials','textures','images'])assert.deepEqual(output.json[key],source.json[key],key);
  assert.deepEqual(output.json.meshes.slice(1),source.json.meshes.slice(1),'all independent eye meshes');
  const p=output.json.meshes[0].primitives[0];
  const changed=new Set([p.indices,...Object.values(p.attributes)].map(id=>output.json.accessors[id].bufferView));
  for(let i=0;i<output.json.bufferViews.length;i++)if(!changed.has(i))assert.deepEqual(await decodeView(output,i),await decodeView(source,i),`unchanged eye/texture view ${i}`);
  for(let i=0;i<output.json.accessors.length;i++)if(![p.indices,...Object.values(p.attributes)].includes(i))assert.deepEqual(output.json.accessors[i],source.json.accessors[i]);
  const a=output.json.accessors[p.indices],positions=output.json.accessors[p.attributes.POSITION];
  assert.ok(a.count<source.json.accessors[p.indices].count);
  const indices=await decodeView(output,a.bufferView);
  for(let i=0;i<indices.length;i+=4)assert.ok(indices.readUInt32LE(i)<positions.count,'index within vertex buffer');
  const normal=output.json.accessors[p.attributes.NORMAL];
  assert.equal(normal.componentType,5122);assert.equal(normal.normalized,true);assert.equal(normal.type,'VEC3');
  assert.ok(output.json.extensionsRequired.includes('KHR_mesh_quantization'));
  for(const id of Object.values(p.attributes))assert.equal(output.json.accessors[id].count,positions.count);
  if(url.includes('hoho-eye-rig')){
    await MeshoptEncoder.ready;
    const oldPositions=await decodeView(source,source.json.accessors[p.attributes.POSITION].bufferView);
    const oldFloats=new Float32Array(oldPositions.buffer,oldPositions.byteOffset,oldPositions.length/4);
    const filtered=MeshoptEncoder.encodeFilterExp(oldFloats,oldFloats.length/3,12,16,'SharedComponent');
    const expectedPositions=Buffer.alloc(oldPositions.length);
    MeshoptDecoder.decodeGltfBuffer(expectedPositions,oldFloats.length/3,12,MeshoptEncoder.encodeGltfBuffer(filtered,oldFloats.length/3,12,'ATTRIBUTES'),'ATTRIBUTES','EXPONENTIAL');
    const actualPositions=await decodeView(output,positions.bufferView);
    const vertexKeys=buffer=>Array.from({length:buffer.length/12},(_,i)=>buffer.subarray(i*12,i*12+12).toString('hex'));
    const oldKeys=vertexKeys(expectedPositions),newKeys=vertexKeys(actualPositions);
    const key=(a,b,c)=>a<=b&&a<=c?a+b+c:b<=a&&b<=c?b+c+a:c+a+b;
    const protectedVertex=i=>{const dx=oldFloats[i*3]+.41,dy=oldFloats[i*3+1]+.08;return ((.78*dx+.625*dy)/.165)**2+((-.625*dx+.78*dy)/.21)**2<1&&oldFloats[i*3+2]>.12;};
    const originalIndices=await decodeView(source,source.json.accessors[p.indices].bufferView);
    const required=new Map();let protectedCount=0;
    for(let i=0;i<originalIndices.length;i+=12){const a=originalIndices.readUInt32LE(i),b=originalIndices.readUInt32LE(i+4),c=originalIndices.readUInt32LE(i+8);if(protectedVertex(a)||protectedVertex(b)||protectedVertex(c)){const value=key(oldKeys[a],oldKeys[b],oldKeys[c]);required.set(value,(required.get(value)??0)+1);protectedCount++;}}
    assert.equal(protectedCount,43073,'entire authored face-region topology covered');
    for(let i=0;i<indices.length;i+=12){const value=key(newKeys[indices.readUInt32LE(i)],newKeys[indices.readUInt32LE(i+4)],newKeys[indices.readUInt32LE(i+8)]),count=required.get(value);if(count===1)required.delete(value);else if(count)required.set(value,count-1);}
    assert.equal(required.size,0,'no protected face triangle removed, beyond bounded delivery quantization');
  }
});

test('flowers reuse the authored middle LOD without changing placement nodes or distant topology',async()=>{
  const url='/assets/knit/flowers.glb',transport=transports[url];
  const source=parseGlb(readFileSync('public'+url));
  const encoded=deliveredBytes(transport);
  const output=parseGlb(transport.encoding?gunzipSync(encoded):encoded);
  assert.deepEqual(output.json.nodes,source.json.nodes);
  assert.deepEqual(output.json.materials,source.json.materials);
  for(const mesh of output.json.meshes){
    const original=source.json.meshes.find(m=>m.name===mesh.name.replace('-near','-mid'));
    const p=mesh.primitives[0],old=original.primitives[0];
    assert.equal(output.json.accessors[p.indices].count,source.json.accessors[old.indices].count);
    const a=await decodeView(output,output.json.accessors[p.attributes.POSITION].bufferView);
    const b=await decodeView(source,source.json.accessors[old.attributes.POSITION].bufferView);
    assert.equal(a.length,b.length);
    for(let i=0;i<a.length;i+=4)assert.ok(Math.abs(a.readFloatLE(i)-b.readFloatLE(i))<=0.000031);
    if(mesh.name.endsWith('-near'))assert.deepEqual(p,output.json.meshes.find(m=>m.name===mesh.name.replace('-near','-mid')).primitives[0]);
  }
});
