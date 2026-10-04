import {useEffect,useMemo,useRef,type RefObject} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import {groundHeight,jarPlacement} from './world-layout';

export function LidShadow({lid,mobile,aspect}:{lid:RefObject<THREE.Group|null>;mobile:boolean;aspect:number}){
  const mesh=useRef<THREE.Mesh>(null),jar=jarPlacement(mobile,aspect);
  const material=useMemo(()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,uniforms:{contact:{value:0}},vertexShader:'varying vec2 p;void main(){p=uv*2.0-1.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform float contact;varying vec2 p;void main(){float a=exp(-dot(p,p)*3.5)*(1.0-smoothstep(.7,1.0,length(p)));gl_FragColor=vec4(.20,.16,.07,a*.3*contact);}'}),[]);
  useFrame(()=>{if(!mesh.current||!lid.current)return;const position=lid.current.position,y=groundHeight(jar.x+position.x,jar.z+position.z);mesh.current.position.set(position.x,y+.055,position.z);material.uniforms.contact.value=THREE.MathUtils.clamp(1-(position.y-y-.40)/1.2,0,1);});
  useEffect(()=>()=>material.dispose(),[material]);
  return <mesh ref={mesh} rotation={[-Math.PI/2,0,0]} material={material} raycast={()=>null}><planeGeometry args={[2.4,2.6]}/></mesh>;
}
