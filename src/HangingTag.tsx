import { webImage } from './web-images.ts';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import {useSceneTexture} from './scene-texture';
import * as THREE from 'three';
import {groundHeight} from './world-layout';
import { advanceTag } from './tag-motion';

const HOLE_Y = (0.5 - 190 / 1254) * 0.98;
const STRING_LENGTH = 0.18;

export function HangingTag({lid, reducedMotion}: {lid: RefObject<THREE.Group | null>; reducedMotion: boolean}) {
  const anchor = useRef<THREE.Group>(null);
  const swing = useRef<THREE.Group>(null);
  const card = useRef<THREE.Group>(null);
  const orientation=useMemo(()=>({desired:new THREE.Quaternion(),euler:new THREE.Euler()}),[]);
  const texture = useSceneTexture(webImage('/assets/knit/hoho-tag.png'));
  const motion = useRef({angle: 0.025, velocity: 0});
  const tracking = useMemo(() => ({position: new THREE.Vector3(), previous: new THREE.Vector3(), velocity: new THREE.Vector3(), previousVelocity: new THREE.Vector3(), initialized: false, time: 0}), []);
  const string = useMemo(() => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,0,0), new THREE.Vector3(-0.018,-0.085,0.026),
    new THREE.Vector3(-0.012,-STRING_LENGTH,0.038), new THREE.Vector3(0,-STRING_LENGTH-0.025,0.015),
    new THREE.Vector3(0.014,-STRING_LENGTH,-0.014), new THREE.Vector3(0.017,-0.08,-0.008),
  ], true), 56, 0.009, 7, true), []);
  useEffect(() => {texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true;}, [texture]);
  useEffect(() => () => string.dispose(), [string]);
  useFrame(({gl}, delta) => {
    if (!anchor.current || !swing.current || !lid.current) return;
    anchor.current.updateWorldMatrix(true, false);
    anchor.current.getWorldPosition(tracking.position);
    if (reducedMotion) {
      motion.current.angle = 0; motion.current.velocity = 0;
      tracking.initialized = false;
    } else {
      const dt = Math.min(delta, 0.05);
      tracking.time += dt;
      let accelerationX = 0, accelerationY = 0;
      if (tracking.initialized && delta < 0.1 && dt > 0.001) {
        tracking.velocity.copy(tracking.position).sub(tracking.previous).divideScalar(dt);
        accelerationX = THREE.MathUtils.clamp((tracking.velocity.x - tracking.previousVelocity.x) / dt, -16, 16);
        accelerationY = THREE.MathUtils.clamp((tracking.velocity.y - tracking.previousVelocity.y) / dt, -8, 8);
      } else tracking.velocity.set(0,0,0);
      tracking.previous.copy(tracking.position);
      tracking.previousVelocity.copy(tracking.velocity);
      tracking.initialized = true;
      const breeze = Math.sin(tracking.time * 1.45) * 0.85 + Math.sin(tracking.time * 0.77) * 0.45;
      advanceTag(motion.current, dt, breeze - accelerationX * 1.2, 24 + accelerationY);
    }
    const ground=groundHeight(tracking.position.x,tracking.position.z+.5)+.07;
    const clearance=Math.max(0,tracking.position.y-STRING_LENGTH-ground);
    const rest=Math.min(1,clearance/.65);
    orientation.euler.set(0,reducedMotion?0:Math.sin(tracking.time*1.1)*.035*rest,motion.current.angle*rest);
    orientation.desired.setFromEuler(orientation.euler);
    swing.current.quaternion.copy(lid.current.quaternion).invert().multiply(orientation.desired);
    // The hole remains tied to the loop; the lower edge settles against the ground.
    if(card.current)card.current.rotation.x=-Math.acos(THREE.MathUtils.clamp(clearance/(HOLE_Y+.49),0,1));
    if (import.meta.env.DEV) gl.domElement.dataset.tagSwing = THREE.MathUtils.radToDeg(motion.current.angle).toFixed(3);
  });
  return <group ref={anchor} position={[0,-0.17,0.88]}>
    <mesh rotation={[Math.PI/2,0,0]}><torusGeometry args={[0.024,0.01,7,18]}/><meshStandardMaterial color="#b69b70" roughness={1}/></mesh>
    <group ref={swing}>
      <mesh geometry={string}><meshStandardMaterial color="#b69b70" roughness={1}/></mesh>
      <group ref={card} position={[0,-STRING_LENGTH,0.015]}><mesh position={[0,-HOLE_Y,0]}>
        <planeGeometry args={[0.86,0.98]}/>
        <meshBasicMaterial map={texture} transparent alphaTest={0.08} side={THREE.DoubleSide} toneMapped={false}/>
      </mesh></group>
    </group>
  </group>;
}
