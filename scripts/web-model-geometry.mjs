import {MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier} from 'meshoptimizer';

const profiles = {
  '/assets/knit/hoho-eye-rig-display.glb': {triangles:600000, error:.00035, positionBits:16, uvBits:16, normalBits:12},
  '/assets/knit/lid-knit-display.glb': {triangles:20000, error:.003},
  '/assets/knit/jar-base-display.glb': {triangles:20000, error:.003},
};
export function parseGlb(bytes) {
  const size=bytes.readUInt32LE(12);
  return {json:JSON.parse(bytes.toString('utf8',20,20+size)), binary:bytes.subarray(28+size)};
}
export async function decodeView(model,index) {
  const view=model.json.bufferViews[index], ext=view.extensions?.EXT_meshopt_compression;
  if(!ext)return model.binary.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength);
  await MeshoptDecoder.ready;
  const raw=Buffer.alloc(view.byteLength);
  MeshoptDecoder.decodeGltfBuffer(raw,ext.count,ext.byteStride,model.binary.subarray(ext.byteOffset,ext.byteOffset+ext.byteLength),ext.mode,ext.filter);
  return raw;
}
const floats = bytes => new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));

// Rebuilt only for web delivery. Separate eyeballs, corneas, socket rims, nodes,
// materials and embedded texture bytes are retained; no source GLB is overwritten.
export async function optimizeModelGeometry(bytes,url) {
  if(url==='/assets/knit/flowers.glb')return optimizeFlowerGeometry(bytes,url);
  const profile=profiles[url];
  if(!profile)return {bytes,report:null};
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready,MeshoptSimplifier.ready]);
  MeshoptSimplifier.useExperimentalFeatures=true;
  const source=parseGlb(bytes),json=structuredClone(source.json),p=json.meshes[0].primitives[0];
  const ids=[p.indices,...Object.values(p.attributes)];
  const changed=new Map();
  for(const id of ids){
    const a=json.accessors[id],v=json.bufferViews[a.bufferView];
    if(a.byteOffset || v.byteStride)throw new Error('Expected independent tightly packed model attributes');
    changed.set(a.bufferView,await decodeView(source,a.bufferView));
  }
  const attribute = name => floats(changed.get(json.accessors[p.attributes[name]].bufferView));
  const position=attribute('POSITION'),normal=attribute('NORMAL'),uv=attribute('TEXCOORD_0');
  const originalIndex=changed.get(json.accessors[p.indices].bufferView);
  const indices=new Uint32Array(originalIndex.buffer.slice(originalIndex.byteOffset,originalIndex.byteOffset+originalIndex.byteLength));
  const attributes=new Float32Array(position.length/3*5);
  for(let i=0;i<position.length/3;i++)attributes.set([normal[i*3],normal[i*3+1],normal[i*3+2],uv[i*2],uv[i*2+1]],i*5);
  const protectedFaces=[],candidates=[];
  const faceVertex=i=>{
    if(!url.includes('hoho-eye-rig'))return false;
    // The authored face tilts with the eye line. Preserve this entire skin region
    // before simplification; the much denser hair may still use the delivery mesh.
    const dx=position[i*3]+.41,dy=position[i*3+1]+.08;
    const u=.78*dx+.625*dy,v=-.625*dx+.78*dy;
    return (u/.165)**2+(v/.21)**2<1 && position[i*3+2]>.12;
  };
  for(let i=0;i<indices.length;i+=3){const target=faceVertex(indices[i])||faceVertex(indices[i+1])||faceVertex(indices[i+2])?protectedFaces:candidates;target.push(indices[i],indices[i+1],indices[i+2]);}
  const [simplified,error]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(candidates),position,3,attributes,5,[.02,.02,.02,.2,.2],null,Math.max(0,profile.triangles*3-protectedFaces.length),profile.error,['LockBorder','Sparse']);
  const result=new Uint32Array(protectedFaces.length+simplified.length);result.set(protectedFaces);result.set(simplified,protectedFaces.length);
  // Border locking preserves open edges, including the skin around the eye holes.
  const [remap,vertexCount]=MeshoptEncoder.reorderMesh(result,true,false);
  changed.set(json.accessors[p.indices].bufferView,Buffer.from(result.buffer));
  json.accessors[p.indices].count=result.length;
  for(const id of Object.values(p.attributes)){
    const a=json.accessors[id],data=changed.get(a.bufferView),stride=data.length/a.count,out=Buffer.alloc(vertexCount*stride);
    for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)data.copy(out,remap[i]*stride,i*stride,(i+1)*stride);
    changed.set(a.bufferView,out);a.count=vertexCount;
  }
  const configs=new Map([
    [json.accessors[p.indices].bufferView,{mode:'TRIANGLES',filter:'NONE',stride:4,count:result.length}],
    [json.accessors[p.attributes.POSITION].bufferView,{mode:'ATTRIBUTES',filter:'EXPONENTIAL',stride:12,bits:profile.positionBits??14,count:vertexCount}],
    [json.accessors[p.attributes.TEXCOORD_0].bufferView,{mode:'ATTRIBUTES',filter:'EXPONENTIAL',stride:8,bits:profile.uvBits??12,count:vertexCount}],
    [json.accessors[p.attributes.NORMAL].bufferView,{mode:'ATTRIBUTES',filter:'OCTAHEDRAL',stride:8,bits:profile.normalBits??10,count:vertexCount}],
  ]);
  const chunks=[];let offset=0,fallback=0;
  const append=data=>{const start=offset;chunks.push(data);offset+=data.length;const pad=(4-offset%4)%4;chunks.push(Buffer.alloc(pad));offset+=pad;return start;};
  const precision={};
  for(const [i,view] of json.bufferViews.entries()){
    const config=configs.get(i),old=source.json.bufferViews[i],ext=old.extensions?.EXT_meshopt_compression;
    if(!config){
      // Byte-for-byte copy of every untouched mesh/texture, relocating only offsets.
      const address=ext??old,data=source.binary.subarray(address.byteOffset??0,(address.byteOffset??0)+address.byteLength);
      if(ext){view.byteOffset=fallback;fallback+=view.byteLength;view.extensions.EXT_meshopt_compression.byteOffset=append(data);}
      else view.byteOffset=append(data);
      continue;
    }
    let input=changed.get(i);
    if(config.filter==='EXPONENTIAL')input=MeshoptEncoder.encodeFilterExp(floats(input),config.count,config.stride,config.bits,'SharedComponent');
    if(config.filter==='OCTAHEDRAL'){
      const raw=floats(input),vectors=new Float32Array(config.count*4);
      for(let k=0;k<config.count;k++)vectors.set(raw.subarray(k*3,k*3+3),k*4);
      input=MeshoptEncoder.encodeFilterOct(vectors,config.count,8,config.bits);
      const a=json.accessors[p.attributes.NORMAL];a.componentType=5122;a.normalized=true;
      view.byteStride=8;
    }
    const encoded=MeshoptEncoder.encodeGltfBuffer(input,config.count,config.stride,config.mode);
    view.byteLength=config.count*config.stride;view.buffer=1;view.byteOffset=fallback;fallback+=view.byteLength;
    view.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:append(encoded),byteLength:encoded.length,byteStride:config.stride,count:config.count,mode:config.mode,filter:config.filter}};
    const decoded=Buffer.alloc(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(decoded,config.count,config.stride,encoded,config.mode,config.filter);
    if(config.filter==='EXPONENTIAL'){
      const before=floats(changed.get(i)),after=floats(decoded);let maxError=0;
      for(let k=0;k<before.length;k++)maxError=Math.max(maxError,Math.abs(before[k]-after[k]));
      const isPosition=i===json.accessors[p.attributes.POSITION].bufferView;
      precision[isPosition?'positionMaxError':'uvMaxError']=maxError;
      if(isPosition){const a=json.accessors[p.attributes.POSITION];a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let k=0;k<after.length;k++){a.min[k%3]=Math.min(a.min[k%3],after[k]);a.max[k%3]=Math.max(a.max[k%3],after[k]);}}
    }
    if(config.filter==='OCTAHEDRAL'){
      const before=floats(changed.get(i)),after=new Int16Array(decoded.buffer,decoded.byteOffset,decoded.length/2);let maxAngle=0;
      for(let k=0;k<config.count;k++){const a=before.subarray(k*3,k*3+3),b=after.subarray(k*4,k*4+3);const dot=(a[0]*b[0]+a[1]*b[1]+a[2]*b[2])/(Math.hypot(...a)*Math.hypot(...b));maxAngle=Math.max(maxAngle,Math.acos(Math.min(1,Math.max(-1,dot)))*180/Math.PI);}
      precision.normalMaxDegrees=maxAngle;
    }
  }
  if(precision.positionMaxError>0.00007 || precision.uvMaxError>0.0003 || precision.normalMaxDegrees>.4)throw new Error('Model precision exceeded delivery budget');
  json.buffers=[{byteLength:offset},{byteLength:fallback,extensions:{EXT_meshopt_compression:{fallback:true}}}];
  for(const key of ['extensionsUsed','extensionsRequired'])json[key]=[...new Set([...(json[key]??[]),'KHR_mesh_quantization'])];
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+offset,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bin=Buffer.alloc(8);bin.writeUInt32LE(offset);bin.writeUInt32LE(0x004e4942,4);
  const output=Buffer.concat([header,padded,bin,...chunks]);
  return {bytes:output,report:{url,beforeBytes:bytes.length,bytes:output.length,beforeTriangles:indices.length/3,triangles:result.length/3,protectedFaceTriangles:protectedFaces.length/3,errorLimit:profile.error,reportedError:error,objectSpaceError:error*MeshoptSimplifier.getScale(position,3),vertices:vertexCount,...precision,otherMeshesAndTextureBytesUnchanged:true}};
}

async function optimizeFlowerGeometry(bytes,url) {
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  const source=parseGlb(bytes),json=structuredClone(source.json),configs=new Map();
  // Reuse the authored medium flower LOD for the small foreground flowers too.
  // It retains the established silhouette/color mesh; placement and wind are unchanged.
  for(const mesh of json.meshes)if(mesh.name.endsWith('-near'))mesh.primitives=structuredClone(json.meshes.find(other=>other.name===mesh.name.replace('-near','-mid')).primitives);
  const usedAccessors=[...new Set(json.meshes.flatMap(mesh=>mesh.primitives.flatMap(p=>[p.indices,...Object.values(p.attributes)])))].sort((a,b)=>a-b);
  const sourceViews=[...new Set(usedAccessors.map(i=>json.accessors[i].bufferView))].sort((a,b)=>a-b);
  const accessorMap=new Map(usedAccessors.map((id,i)=>[id,i])),viewMap=new Map(sourceViews.map((id,i)=>[id,i]));
  json.accessors=usedAccessors.map(id=>({...json.accessors[id],bufferView:viewMap.get(json.accessors[id].bufferView)}));
  json.bufferViews=sourceViews.map(id=>json.bufferViews[id]);
  for(const mesh of json.meshes)for(const p of mesh.primitives){p.indices=accessorMap.get(p.indices);for(const key of Object.keys(p.attributes))p.attributes[key]=accessorMap.get(p.attributes[key]);}
  for(const mesh of json.meshes)for(const p of mesh.primitives){
    for(const [name,id] of Object.entries(p.attributes))configs.set(json.accessors[id].bufferView,{name,id});
    configs.set(json.accessors[p.indices].bufferView,{name:'INDICES',id:p.indices});
  }
  const chunks=[];let offset=0,fallback=0;
  for(const [index,view] of json.bufferViews.entries()){
    const {name,id}=configs.get(index),a=json.accessors[id],raw=await decodeView(source,sourceViews[index]);
    let input=raw,stride=12,filter='NONE',mode='ATTRIBUTES';
    if(name==='INDICES'){stride=4;mode='TRIANGLES';delete view.byteStride;}
    else if(name==='NORMAL'){
      const n=floats(raw),v=new Float32Array(a.count*4);
      for(let i=0;i<a.count;i++)v.set(n.subarray(i*3,i*3+3),i*4);
      input=MeshoptEncoder.encodeFilterOct(v,a.count,8,10);stride=8;filter='OCTAHEDRAL';a.componentType=5122;a.normalized=true;view.byteStride=8;
    }else{
      input=MeshoptEncoder.encodeFilterExp(floats(raw),a.count,12,name==='POSITION'?16:14,'SharedComponent');filter='EXPONENTIAL';
      if(name==='POSITION'){
        const decoded=Buffer.alloc(raw.length);
        MeshoptDecoder.decodeGltfBuffer(decoded,a.count,12,MeshoptEncoder.encodeGltfBuffer(input,a.count,12,'ATTRIBUTES'),'ATTRIBUTES',filter);
        const xyz=floats(decoded);a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
        for(let i=0;i<xyz.length;i++){a.min[i%3]=Math.min(a.min[i%3],xyz[i]);a.max[i%3]=Math.max(a.max[i%3],xyz[i]);}
      }
    }
    const data=MeshoptEncoder.encodeGltfBuffer(input,a.count,stride,mode);
    view.buffer=1;view.byteOffset=fallback;view.byteLength=a.count*stride;fallback+=view.byteLength;
    view.extensions={EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:data.length,byteStride:stride,count:a.count,mode,filter}};
    chunks.push(data);offset+=data.length;const pad=(4-offset%4)%4;chunks.push(Buffer.alloc(pad));offset+=pad;
  }
  json.buffers=[{byteLength:offset},{byteLength:fallback,extensions:{EXT_meshopt_compression:{fallback:true}}}];
  for(const key of ['extensionsUsed','extensionsRequired'])json[key]=[...new Set([...(json[key]??[]),'KHR_mesh_quantization'])];
  const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+padded.length+offset,8);header.writeUInt32LE(padded.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const bin=Buffer.alloc(8);bin.writeUInt32LE(offset);bin.writeUInt32LE(0x004e4942,4);
  const output=Buffer.concat([header,padded,bin,...chunks]);
  return {bytes:output,report:{url,beforeBytes:bytes.length,bytes:output.length,nearLod:'existing-mid',otherLodsTopologyPreserved:true}};
}
