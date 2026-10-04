import { webImage } from './web-images.ts';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {useSceneTexture} from './scene-texture';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight, isRestingArea } from './world-layout';
import {isLidLandingArea} from './lid-motion';
import { Flowers } from './Flowers';
import { seededRandom as randomSequence } from './flower-layout';

const noRaycast = () => null;
const ROOT = '/assets/knit/';
function surface(texture: THREE.Texture, repeat = 1) {
  const copy = texture.clone();
  copy.colorSpace = THREE.SRGBColorSpace;
  copy.wrapS = copy.wrapT = THREE.MirroredRepeatWrapping;
  copy.repeat.setScalar(repeat); copy.anisotropy = 8; copy.needsUpdate = true;
  return copy;
}
function Ground() {
  const source = useSceneTexture(webImage(ROOT + 'ground-knit.png'));
  const texture = useMemo(() => surface(source), [source]);
  const geometries = useMemo(() => Array.from({length:56},(_,tile) => {
    // Same vertex density and UVs, split into tiles so offscreen terrain is culled.
    const mesh = new THREE.PlaneGeometry(10, 10, 60, 60).rotateX(-Math.PI / 2).translate(-35+(tile%8)*10, 0, -45+Math.floor(tile/8)*10);
    const positions = mesh.attributes.position, uv = mesh.attributes.uv;
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, groundHeight(x, z)); uv.setXY(i, x / 3.8, z / 3.8);
      const shade = 0.89 + Math.sin(x * 0.39 + z * 0.23) * 0.05 + Math.cos(z * 0.31) * 0.05;
      colors.set([shade,shade,shade*.96],i*3);
    }
    mesh.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Shared world-space slopes keep the normal continuous across tile boundaries.
    const normal=new THREE.Vector3();
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i),step=.01;
      normal.set(-(groundHeight(x+step,z)-groundHeight(x-step,z))/(2*step),1,-(groundHeight(x,z+step)-groundHeight(x,z-step))/(2*step)).normalize();
      mesh.attributes.normal.setXYZ(i,normal.x,normal.y,normal.z);
    }
    mesh.computeBoundingSphere();mesh.boundingSphere!.radius+=.075;return mesh;
  }), []);
  const material=useMemo(()=>new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:.07,displacementMap:texture,displacementScale:.075,displacementBias:-.025,roughness:1,color:'#c3c79c',vertexColors:true}),[texture]);
  useEffect(() => () => { texture.dispose(); material.dispose(); geometries.forEach(g=>g.dispose()); }, [texture, geometries,material]);
  return <>{geometries.map((geometry,i)=><mesh key={i} geometry={geometry} material={material} receiveShadow raycast={noRaycast}/>)}</>;
}

function Moss({mobile,aspect}: {mobile:boolean;aspect:number}) {
  const source = useSceneTexture(webImage(ROOT + 'ground-knit.png'));
  const texture = useMemo(() => surface(source, 0.32), [source]);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const parts = [
      new THREE.SphereGeometry(1,12,9).scale(0.12,0.16,0.11).rotateZ(-0.4).translate(-0.1,0.055,0),
      new THREE.SphereGeometry(1,12,9).scale(0.11,0.17,0.12).rotateZ(0.45).translate(0.1,0.06,0),
      new THREE.SphereGeometry(1,12,9).scale(0.12,0.10,0.15).translate(0,0.055,-0.12),
    ];
    const value = mergeGeometries(parts)!; parts.forEach(p => p.dispose()); return value;
  }, []);
  const matrices = useMemo(() => {
    const random = randomSequence(7129), dummy = new THREE.Object3D(), values: THREE.Matrix4[] = [];
    for (let i=0;i<3600;i++) {
      const x = random()*36-18, z = random()*30-22;
      if (isRestingArea(x,z,mobile,0.26,aspect)||isLidLandingArea(x,z,mobile,aspect,.2)) continue;
      dummy.position.set(x,groundHeight(x,z),z);
      dummy.scale.set(0.6+random()*1.05,0.45+random()*0.7,0.6+random()*1.05);
      dummy.rotation.set(0,random()*Math.PI*2,0); dummy.updateMatrix(); values.push(dummy.matrix.clone());
    }
    return values;
  }, [mobile,aspect]);
  useLayoutEffect(() => {
    matrices.forEach((matrix,index) => mesh.current!.setMatrixAt(index,matrix));
    mesh.current!.instanceMatrix.needsUpdate=true;mesh.current!.computeBoundingSphere();
  }, [matrices]);
  const culling=useMemo(()=>({frustum:new THREE.Frustum(),matrix:new THREE.Matrix4(),previous:new THREE.Matrix4().makeScale(0,0,0),sphere:new THREE.Sphere()}),[matrices]);
  useFrame(({camera})=>{
    camera.updateMatrixWorld();culling.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    if(culling.matrix.equals(culling.previous))return;
    culling.previous.copy(culling.matrix);culling.frustum.setFromProjectionMatrix(culling.matrix);
    let count=0;
    for(const matrix of matrices){culling.sphere.center.setFromMatrixPosition(matrix);culling.sphere.radius=.65;if(culling.frustum.intersectsSphere(culling.sphere))mesh.current!.setMatrixAt(count++,matrix);}
    mesh.current!.count=count;mesh.current!.instanceMatrix.needsUpdate=true;
  });
  useEffect(() => () => {texture.dispose();geometry.dispose();}, [texture,geometry]);
  return <instancedMesh ref={mesh} args={[geometry,undefined,matrices.length]} frustumCulled={false} castShadow receiveShadow raycast={noRaycast}>
    <meshStandardMaterial map={texture} bumpMap={texture} bumpScale={0.024} color="#c2c699" roughness={1}/>
  </instancedMesh>;
}

function Sky({reducedMotion}: {reducedMotion: boolean}) {
  const source = useSceneTexture(webImage(ROOT + 'ivory-knit.png'));
  const wool = useMemo(() => surface(source, 1.8), [source]);
  const skyTexture = useMemo(() => surface(source, 40), [source]);
  const skyMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({map: skyTexture, color: '#eaa126', toneMapped: false});
    // Retain the yarn relief without multiplying its beige albedo into the sky.
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        float yarn = dot(texture2D(map, vMapUv).rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= clamp(0.94 + (yarn - 0.62) * 0.45, 0.77, 1.07);
      `);
    };
    return material;
  }, [skyTexture]);
  const clouds = useRef<THREE.Group>(null);
  const time = useRef(0);
  const cloudGeometry = useMemo(() => {
    const shapes = [[-1.35,0,0,0.9,0.66,0.6],[-0.58,0.34,0,0.92,0.9,0.76],[0.35,0.2,0.04,1.02,0.91,0.82],[1.3,-0.1,0,0.8,0.65,0.62]];
    const parts = shapes.map(([x,y,z,sx,sy,sz]) => new THREE.SphereGeometry(1, 26, 18).scale(sx,sy,sz).translate(x,y,z));
    const merged = mergeGeometries(parts)!; parts.forEach(part => part.dispose()); return merged;
  }, []);
  const starGeometry = useMemo(() => {
    const points = Array.from({length:10}, (_, i) => {
      const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? 0.25 : 0.48;
      return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
    });
    return new THREE.ExtrudeGeometry(new THREE.Shape(points), {depth:0.12,bevelEnabled:true,bevelSegments:4,steps:1,bevelSize:0.09,bevelThickness:0.1});
  }, []);
  useFrame((_, delta) => {
    if (!reducedMotion) time.current += Math.min(delta, 0.05);
    if (clouds.current) clouds.current.children.forEach((cloud, i) => {cloud.position.x = Number(cloud.userData.x) + Math.sin(time.current * 0.13 + i) * 0.3;});
  });
  useEffect(() => () => {wool.dispose(); skyTexture.dispose(); skyMaterial.dispose(); cloudGeometry.dispose(); starGeometry.dispose();}, [wool, skyTexture, skyMaterial, cloudGeometry,starGeometry]);
  return <>
    <mesh position={[0, 12, -38]} raycast={noRaycast}>
      <planeGeometry args={[130, 75]} /><primitive object={skyMaterial} attach="material"/>
    </mesh>
    <group ref={clouds}>
      {[[-17,7.5,-28,1.7],[-5,10.3,-30,1.35],[11,8,-28,2.1],[25,5,-30,1.5],[-26,2.5,-31,2]].map(([x,y,z,scale], i) => <mesh key={i} geometry={cloudGeometry} position={[x,y,z]} scale={scale} userData={{x}} raycast={noRaycast}>
        <meshStandardMaterial color="#fff5e1" map={wool} bumpMap={wool} bumpScale={0.065} roughness={1} emissive="#fff0d5" emissiveIntensity={0.16} />
      </mesh>)}
    </group>
    {[[-23,10,-30,0.8],[-10,6.8,-29,0.65],[-1,10.5,-30,0.6],[3,6.5,-30,0.65],[21,10,-30,0.9],[19,4,-28,0.55],[-21,3,-30,0.55]].map(([x,y,z,scale],i) => <mesh key={i} geometry={starGeometry} position={[x,y,z]} scale={scale} rotation={[0,-0.1,(i%2?1:-1)*0.2]} raycast={noRaycast}>
      <meshStandardMaterial map={wool} bumpMap={wool} bumpScale={0.025} color="#fff0cf" roughness={1} emissive="#fff0d5" emissiveIntensity={0.12}/>
    </mesh>)}
  </>;
}

export function Meadow({mobile,reducedMotion,aspect}: {mobile:boolean;reducedMotion:boolean;aspect:number}) {
  const {gl, scene} = useThree();
  useEffect(() => {
    // Static hero geometry casts a real shadow once; moving flowers do not redraw 12M faces.
    gl.shadowMap.autoUpdate = false; gl.shadowMap.needsUpdate = true;
    scene.background = new THREE.Color('#eaa126');
    return () => { gl.shadowMap.autoUpdate = true; scene.background = null; };
  }, [gl, scene, mobile,aspect]);
  return <><Sky reducedMotion={reducedMotion}/><Ground/><Moss mobile={mobile} aspect={aspect}/><Flowers mobile={mobile} reducedMotion={reducedMotion} aspect={aspect}/></>;
}
