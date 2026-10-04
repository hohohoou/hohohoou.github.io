import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import type {SceneState} from './state';
import {normalizedPointer} from './camera';

/** Shared distant gaze target; preserve each authored neutral pose and real sphere pivot. */
export function EyeFollow({model,state,mobile,reducedMotion}:{model:THREE.Object3D;state:SceneState;mobile:boolean;reducedMotion:boolean}){
  const {camera,gl,invalidate}=useThree();
  const pointer=useRef({x:0,y:0});
  const eyes=useMemo(()=>['Eye_L','Eye_R'].flatMap(name=>{
    const node=model.getObjectByName(name);
    return node?[{node,neutral:node.quaternion.clone().normalize(),position:new THREE.Vector3(),baseWorld:new THREE.Quaternion(),inverse:new THREE.Quaternion(),rotation:new THREE.Quaternion()}]:[];
  }),[model]);
  useEffect(()=>{
    // Small reflected studio panels illuminate only the new corneal surfaces.
    // An opaque clearcoat avoids a transmission pass over the full body.
    const studio=new THREE.Scene();studio.background=new THREE.Color(.06,.05,.035);
    const geometry=new THREE.PlaneGeometry(1.4,1.4),material=new THREE.MeshBasicMaterial({color:new THREE.Color(3,2.8,2.5),side:THREE.DoubleSide});
    for(const point of [[-3,-1,8],[-1,4,8]]){const panel=new THREE.Mesh(geometry,material);panel.position.set(...point as [number,number,number]);panel.lookAt(0,0,0);studio.add(panel);}
    const generator=new THREE.PMREMGenerator(gl),environment=generator.fromScene(studio,.015,.1,30);
    const originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
    model.traverse(node=>{if(node instanceof THREE.Mesh&&node.name.startsWith('Cornea_')){
      originals.set(node,node.material);
      const copy=(m:THREE.Material)=>{const clone=(m as THREE.MeshPhysicalMaterial).clone();clone.envMap=environment.texture;clone.envMapIntensity=1;return clone;};
      node.material=Array.isArray(node.material)?node.material.map(copy):copy(node.material);
    }});
    generator.dispose();geometry.dispose();material.dispose();invalidate();
    return()=>{for(const [node,original] of originals){for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();node.material=original;}environment.dispose();};
  },[model,gl,invalidate]);
  const work=useMemo(()=>({center:new THREE.Vector3(),forward:new THREE.Vector3(),direction:new THREE.Vector3(),neutralTarget:new THREE.Vector3(),target:new THREE.Vector3(),right:new THREE.Vector3(),up:new THREE.Vector3(),base:new THREE.Vector3(),aim:new THREE.Vector3(),parent:new THREE.Quaternion(),angles:new THREE.Euler(0,0,0,'YXZ')}),[]);
  const enabled=!mobile&&!reducedMotion&&(state==='home'||state==='collection');
  useEffect(()=>{
    const move=(event:PointerEvent)=>{if(event.pointerType!=='touch'){pointer.current=normalizedPointer(event.clientX,event.clientY,innerWidth,innerHeight);invalidate();}};
    const reset=()=>{pointer.current={x:0,y:0};invalidate();};
    const leave=(event:PointerEvent)=>{if(!event.relatedTarget)reset();};
    window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerout',leave);window.addEventListener('blur',reset);
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerout',leave);window.removeEventListener('blur',reset);};
  },[invalidate]);
  useFrame((_,delta)=>{
    if(!eyes.length)return;
    const w=work;model.updateWorldMatrix(true,true);w.center.set(0,0,0);w.forward.set(0,0,0);
    for(const eye of eyes){
      eye.node.getWorldPosition(eye.position);eye.node.parent!.getWorldQuaternion(w.parent);
      eye.baseWorld.copy(w.parent).multiply(eye.neutral);eye.inverse.copy(eye.baseWorld).invert();
      w.center.add(eye.position);w.forward.add(w.direction.set(0,0,1).applyQuaternion(eye.baseWorld));
    }
    w.center.multiplyScalar(1/eyes.length);w.forward.normalize();
    const distance=30;
    w.neutralTarget.copy(w.center).addScaledVector(w.forward,distance);w.target.copy(w.neutralTarget);
    w.right.set(1,0,0).applyQuaternion(camera.quaternion);w.up.set(0,1,0).applyQuaternion(camera.quaternion);
    if(enabled){w.target.addScaledVector(w.right,pointer.current.x*distance*.17).addScaledVector(w.up,pointer.current.y*distance*.105);}
    let maxAngle=0;
    for(const eye of eyes){
      w.base.copy(w.neutralTarget).sub(eye.position).applyQuaternion(eye.inverse).normalize();
      w.aim.copy(w.target).sub(eye.position).applyQuaternion(eye.inverse).normalize();
      const yaw=THREE.MathUtils.clamp(Math.atan2(w.aim.x,w.aim.z)-Math.atan2(w.base.x,w.base.z),-Math.PI/18,Math.PI/18);
      const pitch=THREE.MathUtils.clamp(-Math.asin(w.aim.y)+Math.asin(w.base.y),-Math.PI/30,Math.PI/30);
      w.angles.set(pitch,yaw,0);eye.rotation.setFromEuler(w.angles).premultiply(eye.neutral);
      // Reading, touch and reduced-motion modes return immediately to a stable neutral gaze.
      if(!enabled)eye.node.quaternion.copy(eye.neutral);
      else eye.node.quaternion.slerp(eye.rotation,1-Math.exp(-Math.min(delta,.05)/.15));
      if(eye.node.quaternion.angleTo(eye.rotation)<1e-5)eye.node.quaternion.copy(eye.rotation);
      maxAngle=Math.max(maxAngle,eye.node.quaternion.angleTo(eye.neutral));
    }
    if(import.meta.env.DEV)Object.assign(gl.domElement.dataset,{eyeNodes:String(eyes.length),eyeFollow:String(enabled),eyeAngle:maxAngle.toFixed(5)});
  },-1);
  return null;
}
