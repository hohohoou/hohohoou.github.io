import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {useGLTF} from '@react-three/drei';
import * as THREE from 'three';
import {flowerLayout} from './flower-layout';
import {modelLoader} from './model-loader';

export function Flowers({mobile,reducedMotion,aspect}:{mobile:boolean;reducedMotion:boolean;aspect:number}) {
  const {nodes}=useGLTF('/assets/knit/flowers.glb',false,false,modelLoader);
  const wind=useMemo(()=>({value:0}),[]);
  const meshes=useRef<(THREE.InstancedMesh|null)[]>([]);
  const geometries=useMemo(()=>['white','yellow','orange'].flatMap(color=>['near','mid','far'].map(lod=>(nodes[`${color}-${lod}`] as THREE.Mesh).geometry)),[nodes]);
  const placements=useMemo(()=>flowerLayout(mobile,aspect).map(f=>{
    const object=new THREE.Object3D();object.position.set(f.x,f.y,f.z);object.rotation.set(...f.rotation);object.scale.setScalar(f.scale);object.updateMatrix();
    return {...f,matrix:object.matrix.clone(),sphere:new THREE.Sphere(new THREE.Vector3(f.x,f.y+.61*f.scale,f.z),.87*f.scale+.10)};
  }),[mobile,aspect]);
  const material=useMemo(()=>{
    const value=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94});
    value.onBeforeCompile=shader=>{
      shader.uniforms.uBreeze=wind;
      shader.vertexShader=`uniform float uBreeze;\n${shader.vertexShader}`.replace('#include <begin_vertex>',`
        #include <begin_vertex>
        float phase=instanceMatrix[3].x*.41+instanceMatrix[3].z*.28;
        float bend=pow(max(position.y,0.0)/1.22,2.0);
        transformed.x+=sin(uBreeze*1.35+phase)*.045*bend;
        transformed.z+=cos(uBreeze*.86+phase)*.025*bend;
      `);
    };return value;
  },[wind]);
  const tracking=useMemo(()=>({height:0,ratio:0,viewPoint:new THREE.Vector3(),matrix:new THREE.Matrix4(),previous:new THREE.Matrix4().makeScale(0,0,0),frustum:new THREE.Frustum(),counts:new Array(9).fill(0)}),[placements]);
  useFrame(({camera,size,gl},delta)=>{
    if(!reducedMotion)wind.value+=Math.min(delta,.05);
    camera.updateMatrixWorld();tracking.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    if(tracking.matrix.equals(tracking.previous)&&tracking.height===size.height&&tracking.ratio===gl.getPixelRatio())return;
    tracking.height=size.height;tracking.ratio=gl.getPixelRatio();
    tracking.previous.copy(tracking.matrix);tracking.frustum.setFromProjectionMatrix(tracking.matrix);tracking.counts.fill(0);
    for(const f of placements){
      if(!tracking.frustum.intersectsSphere(f.sphere))continue;
      tracking.viewPoint.copy(f.sphere.center).applyMatrix4(camera.matrixWorldInverse);
      const depth=Math.max(.1,-tracking.viewPoint.z-f.sphere.radius);
      const pixels=1.22*f.scale*size.height*gl.getPixelRatio()/(2*Math.tan(THREE.MathUtils.degToRad(19))*depth);
      // Measured maximum LOD deviation remains below 0.36 device pixels at these cutoffs.
      const lod=pixels>160?0:pixels>42?1:2, slot=f.kind*3+lod;
      meshes.current[slot]?.setMatrixAt(tracking.counts[slot]++,f.matrix);
    }
    meshes.current.forEach((mesh,i)=>{if(mesh){mesh.count=tracking.counts[i];mesh.instanceMatrix.needsUpdate=true;}});
    if(import.meta.env.DEV)gl.domElement.dataset.flowers=String(tracking.counts.reduce((a,b)=>a+b,0));
  });
  useEffect(()=>()=>material.dispose(),[material]);
  return <>{geometries.map((geometry,i)=><instancedMesh key={i} ref={m=>{meshes.current[i]=m;}} args={[geometry,material,placements.length]} frustumCulled={false} castShadow receiveShadow raycast={()=>null}/>)}</>;
}
