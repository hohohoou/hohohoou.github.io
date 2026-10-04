import {MeshoptDecoder} from 'meshoptimizer/meshopt_decoder.module.js';
import type {useGLTF} from '@react-three/drei';
import transports from 'virtual:hoho-model-transports';
import {installModelTransports} from './model-transport';

// Decode the existing lossless buffers off the main thread; no geometry changes.
if(typeof Worker!=='undefined')MeshoptDecoder.useWorkers(2);
export const modelLoader=(loader:Parameters<NonNullable<Parameters<typeof useGLTF>[3]>>[0])=>{
  loader.setMeshoptDecoder(MeshoptDecoder);
  installModelTransports(loader, transports);
};
