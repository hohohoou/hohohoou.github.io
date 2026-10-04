import { webImage } from './web-images.ts';
import {useSceneTexture} from './scene-texture';
import {prepareOpeningImages,openingImageURL} from './opening-images';
import {loadingPhase} from './loading-metrics';
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Environment, Html, Lightformer, useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { experiences, type Experience } from './content';
import type { JourneyMotion } from './journey';
import { pinLaunchPose, readingPinPose } from './pin-motion';
import type { SceneState } from './state';
import art from './art-source.json';
import { cameraPose, normalizedPointer } from './camera';
import { Meadow } from './Meadow';
import {LidShadow} from './LidShadow';
import { HangingTag } from './HangingTag';
import {CachedRenderer} from './CachedRenderer';
import {EyeFollow} from './EyeFollow';
import {modelLoader} from './model-loader';
import { groundHeight, portraitPlacement, jarPlacement } from './world-layout';
import {lidPose} from './lid-motion';
import pinOutline from './pin-outline.json';
import enamelOutlines from './enamel-outlines.json';
import { PinArtwork } from './PinArtwork';
import { PinCase } from './PinCase';

interface SceneProps {
  state: SceneState; mobile: boolean; reducedMotion: boolean; motion: RefObject<JourneyMotion>; selected: Experience;
  onOpen: () => void; onSelect: (id: string) => void; onReady: () => void; onFailure: () => void;
}
const ROOT = '/assets/knit/';
const noRaycast = () => null;
const diagnostics = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
const originalModels = diagnostics?.has('test-original-models');
loadingPhase('scene-module');

// Start the visible scene assets together instead of discovering them across
// repeated Suspense renders. The same loader/cache is reused by each component.
if (!diagnostics?.has('test-model')) {
  const textures = new Set([ROOT+'ground-knit.png', ROOT+'ivory-knit.png', ROOT+'hoho-tag.png']);
  for (const experience of experiences) {
    textures.add(experience.image);
    for (const entry of experience.entries) if (entry.pin) textures.add(entry.pin.image);
  }
  void prepareOpeningImages().then(()=>{for (const url of textures) useTexture.preload(openingImageURL(webImage(url)));}).catch(()=>{});
  for (const url of originalModels ? [art.model, art.jarBase, art.lid] : [art.displayModel, art.displayJarBase, art.displayLid]) {
    useGLTF.preload(url, false, false, modelLoader);
  }
  useGLTF.preload('/assets/knit/flowers.glb', false, false, modelLoader);
}

function Portrait({ mobile,aspect,state,reducedMotion }: Pick<SceneProps, 'mobile'|'state'|'reducedMotion'> & {aspect:number}) {
  const {gl}=useThree();
  const testModel = import.meta.env.DEV ? new URLSearchParams(location.search).get('test-model') : null;
  const url = testModel === 'missing' ? '/assets/absent-model.glb' : testModel === 'source' ? `/${art.source}` : originalModels ? art.model : art.displayModel;
  const { scene } = useGLTF(url, false, false, modelLoader);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse(object => {
      if (object instanceof THREE.Mesh) {
        // Web delivery retains the face region, authored PBR maps and independent eye rig.
        let eyePart=false;
        for(let parent:THREE.Object3D|null=object;parent;parent=parent.parent)if(parent.name==='Eye_L'||parent.name==='Eye_R')eyePart=true;
        object.castShadow = !eyePart; object.receiveShadow = false; object.userData.cacheStatic=!eyePart;
        object.raycast = noRaycast;
        if(import.meta.env.DEV&&object.name==='Body_Static'){
          object.onBeforeRender=()=>{gl.domElement.dataset.bodyDraws=String(Number(gl.domElement.dataset.bodyDraws??0)+1);};
          object.onBeforeShadow=()=>{gl.domElement.dataset.bodyShadowDraws=String(Number(gl.domElement.dataset.bodyShadowDraws??0)+1);};
        }
      }
    });
    return clone;
  }, [scene,gl]);
  const place = portraitPlacement(mobile,aspect);
  return <><primitive object={model} position={[place.x,place.y,place.z]} scale={place.scale} rotation={[0, -0.04, 0]} /><EyeFollow model={model} state={state} mobile={mobile} reducedMotion={reducedMotion}/></>;
}

function CameraRig({ state, mobile, reducedMotion }: Pick<SceneProps, 'state' | 'mobile' | 'reducedMotion'>) {
  const { camera, gl, invalidate } = useThree();
  const pointer = useRef({x: 0, y: 0});
  const look = useRef(new THREE.Vector3(0, 2.1, 0));
  const position = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const sample = useRef({ elapsed: 0, frames: 0, worst: 0, times: [] as number[] });
  useEffect(() => {
    // Window coordinates keep the camera responsive over HTML controls and projected labels.
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer.current = normalizedPointer(event.clientX, event.clientY, innerWidth, innerHeight);
      invalidate();
    };
    const reset = () => { pointer.current = {x: 0, y: 0}; };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) reset(); };
    window.addEventListener('pointermove', move, {passive: true});
    window.addEventListener('pointerout', leave, {passive: true});
    window.addEventListener('blur', reset);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerout', leave); window.removeEventListener('blur', reset); };
  }, [invalidate]);
  useFrame(({clock}, delta) => {
    const fixedCamera = diagnostics?.has('test-fixed-camera');
    const input = diagnostics?.has('test-camera-motion') ? {x: Math.sin(clock.elapsedTime * 1.3), y: Math.cos(clock.elapsedTime * .9) * .7} : pointer.current;
    const pose = cameraPose(state, mobile, input, reducedMotion||!!fixedCamera);
    position.set(...pose.position); target.set(...pose.target);
    const damping = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 4.6);
    camera.position.lerp(position, damping); look.current.lerp(target, damping);
    if(camera.position.distanceToSquared(position)<1e-8)camera.position.copy(position);
    if(look.current.distanceToSquared(target)<1e-8)look.current.copy(target);
    camera.lookAt(look.current);
    if (import.meta.env.DEV) {
      sample.current.elapsed += delta; sample.current.frames++; sample.current.worst = Math.max(sample.current.worst, delta);
      // Fast Refresh may retain a ref created before this diagnostic field existed.
      (sample.current.times ??= []).push(delta * 1000);
      if (sample.current.elapsed >= 4) {
        const times = sample.current.times.sort((a,b) => a-b);
        Object.assign(gl.domElement.dataset, {fps: (sample.current.frames / sample.current.elapsed).toFixed(1), maxFrameMs: (sample.current.worst * 1000).toFixed(1), p95FrameMs: times[Math.min(times.length-1,Math.floor(times.length*.95))].toFixed(1), framesOver32Ms: String(times.filter(t=>t>32).length), sampleFrames:String(times.length), sceneState:state, modelVariant:originalModels?'original':'display', triangles: String(gl.info.render.triangles), drawCalls: String(gl.info.render.calls), cameraX: camera.position.x.toFixed(4), cameraY: camera.position.y.toFixed(4)});
        sample.current = {elapsed: 0, frames: 0, worst: 0, times: []};
      }
    }
  }, -2);
  return null;
}

function SuppliedJarPart({url, base = false, ...props}: {url:string; base?:boolean} & Record<string,unknown>) {
  const {scene}=useGLTF(url,false,false,modelLoader);
  const copy=useMemo(()=>{
    const clone=scene.clone(true);
    clone.traverse(object=>{if(object instanceof THREE.Mesh){
      object.raycast=noRaycast;
      object.castShadow=base;object.userData.cacheStatic=true;
      if(base){
        const material=(object.material as THREE.MeshStandardMaterial).clone();
        // The source roughness map distinguishes glass (~0.15) from wool (~0.6).
        // Discard the baked opaque glass while keeping every crochet petal intact.
        material.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nif(roughnessFactor < 0.31) discard;');
        };
        object.material=material;
      }
    }});
    return clone;
  },[scene,base]);
  return <primitive object={copy} {...props}/>;
}

function GlassMaterial({glow}: {glow: RefObject<number>}) {
  const warmth=useMemo(()=>({value:0}),[]);
  const material = useMemo(() => {
    // Fresnel edge reflections keep the glass clear with one scene pass. Full transmission
    // redraws the 7.6M-triangle portrait and also hides transparent enamel inside the jar.
    const value = new THREE.MeshPhysicalMaterial({color:'#fff3cf',roughness:0.06,metalness:0.12,envMapIntensity:2.1,clearcoat:1,transparent:true,opacity:0.16,depthWrite:false,side:THREE.FrontSide});
    value.onBeforeCompile = shader => {
      shader.uniforms.jarWarmth=warmth;
      shader.fragmentShader='uniform float jarWarmth;\n'+shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        float edge = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0);
        float reflection = max(max(totalSpecular.r, totalSpecular.g), totalSpecular.b);
        outgoingLight = mix(outgoingLight, vec3(1.0, 0.95, 0.81), edge * 0.72);
        outgoingLight += vec3(1.0, 0.64, 0.22) * edge * jarWarmth * .8;
        diffuseColor.a = clamp(0.12 + edge * 0.8 + reflection * 1.3, 0.12, 0.88);
        #include <opaque_fragment>
      `);
    };
    return value;
  }, [warmth]);
  useFrame(()=>{warmth.value=glow.current;});
  useEffect(() => () => material.dispose(), [material]);
  return <primitive object={material} attach="material" />;
}

function JarEdgeGlow({glow,geometry}: {glow: RefObject<number>; geometry:THREE.BufferGeometry}) {
  const material=useMemo(()=>new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:0}},
    vertexShader:`varying vec3 vNormal;varying vec3 vView;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.0);vNormal=normalMatrix*normal;vView=-view.xyz;gl_Position=projectionMatrix*view;}`,
    fragmentShader:`uniform float strength;varying vec3 vNormal;varying vec3 vView;
      void main(){float edge=pow(1.0-abs(dot(normalize(vNormal),normalize(vView))),2.2);
        gl_FragColor=vec4(1.0,.72,.3,edge*strength*.48);}`,
  }),[]);
  useFrame(()=>{material.uniforms.strength.value=glow.current;});
  useEffect(()=>()=>material.dispose(),[material]);
  return <mesh geometry={geometry} material={material} scale={[1.035,1.006,1.035]} renderOrder={3} raycast={noRaycast}/>;
}

function JarGroundGlow({glow,y}: {glow: RefObject<number>; y:number}) {
  const material=useMemo(()=>new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
    uniforms:{strength:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`uniform float strength;varying vec2 vUv;
      void main(){float radius=length(vUv*2.0-1.0);
        float halo=exp(-pow((radius-.69)/.23,2.0))*(1.0-smoothstep(.8,1.0,radius));
        gl_FragColor=vec4(1.0,.72,.32,halo*strength*.4);}`,
  }),[]);
  useFrame(()=>{material.uniforms.strength.value=glow.current;});
  useEffect(()=>()=>material.dispose(),[material]);
  return <mesh position={[0,y,0]} rotation={[-Math.PI/2,0,0]} material={material} raycast={noRaycast}><planeGeometry args={[2.6,2.6]}/></mesh>;
}

function EnamelPin({ onClick, ...props }: {onClick?: (event: ThreeEvent<MouseEvent>) => void} & Record<string, unknown>) {
  const texture = useSceneTexture(webImage(ROOT + 'targetmol-pin.png'));
  useEffect(() => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true; }, [texture]);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(pinOutline.map(([x,y]) => new THREE.Vector2(x,y)));
    const value = new THREE.ExtrudeGeometry(shape,{depth:0.035,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:0.008,bevelThickness:0.008});
    value.translate(0,0,-0.025); return value;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group {...props} onClick={onClick}>
    <mesh geometry={geometry}><meshStandardMaterial color="#c89835" metalness={0.72} roughness={0.28}/></mesh>
    <mesh position={[0,0,0.019]}>
      <planeGeometry args={[1.05,1.05]}/>
      <meshStandardMaterial map={texture} transparent alphaTest={0.15} metalness={0.18} roughness={0.24}/>
    </mesh>
  </group>;
}

function CollectiblePin({ image, badge, onClick }: { image: string; badge: Exclude<Experience['badge'], 'flask'>; onClick: (event: ThreeEvent<MouseEvent>) => void }) {
  return <PinArtwork image={image} contour={enamelOutlines[badge]} metal={badge === 'school' ? '#c9cbd1' : '#c89835'} onClick={onClick} />;
}

function PinTrail({ motion, mobile, reducedMotion, index, count, aspect }: Pick<SceneProps, 'motion' | 'mobile' | 'reducedMotion'> & { index: number; count: number; aspect: number }) {
  const line = useMemo(() => {
    const points = Array.from({ length: 48 }, (_, i) => {
      const p = pinLaunchPose(0.53 + i / 47 * 0.47, mobile, index, count, aspect);
      return new THREE.Vector3(p.x + Math.sin(i * 0.2) * 0.06, p.y, p.z + 0.025);
    });
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#fff0b5', transparent: true, opacity: 0, depthWrite: false }));
  }, [mobile, index, count, aspect]);
  useEffect(() => () => { line.geometry.dispose(); line.material.dispose(); }, [line]);
  useFrame(() => {
    const progress = THREE.MathUtils.clamp((motion.current.opening - 0.53) / 0.47, 0, 1);
    line.visible = !reducedMotion && progress > 0 && progress < 1;
    line.material.opacity = Math.sin(progress * Math.PI) * 0.8;
    const head = Math.floor(progress * 48);
    line.geometry.setDrawRange(Math.max(0, head - 16), Math.min(head, 16));
  });
  return <primitive object={line} />;
}

function ExperiencePin({ state, motion, mobile, reducedMotion, selected, onOpen, onSelect, experience, index, count }: SceneProps & { experience: Experience; index: number; count: number }) {
  const pin = useRef<THREE.Group>(null);
  const { gl, size } = useThree();
  const reading = useMemo(() => readingPinPose(mobile, size.width / size.height), [mobile, size.width, size.height]);
  const target = useMemo(() => new THREE.Vector3(), []);
  const active = selected.id === experience.id;
  const isCase = !!experience.pinCase;
  const activate = () => { if (state === 'home') onOpen(); else onSelect(experience.id); };
  const rest = pinLaunchPose(0, mobile, index, count, size.width / size.height);
  useFrame(({ clock }, delta) => {
    const p = pinLaunchPose(motion.current.opening, mobile, index, count, size.width / size.height);
    const detail = state === 'detail' && active && p.lift >= 1;
    // Opening already has an eased timeline. Smoothing x/y/scale separately
    // cuts across the bottle shoulder on the return trip, so follow its path.
    const throughMouth = motion.current.opening > 0 && motion.current.opening < 1;
    const d = reducedMotion || throughMouth ? 1 : 1 - Math.exp(-Math.min(delta, 0.05) * 6);
    const floating = !reducedMotion && motion.current.opening >= 1 ? Math.sin(clock.elapsedTime * 1.2 + index) * 0.04 : 0;
    target.set(detail ? reading.position.x : p.x, (detail ? reading.position.y : p.y) + floating, detail ? reading.position.z : p.z);
    pin.current!.position.lerp(target, d);
    const scale = detail ? reading.scale : p.scale;
    pin.current!.scale.lerp(target.setScalar(scale), d);
    pin.current!.rotation.set(
      THREE.MathUtils.lerp(pin.current!.rotation.x, p.tilt, d),
      THREE.MathUtils.lerp(pin.current!.rotation.y, p.turn, d),
      THREE.MathUtils.lerp(pin.current!.rotation.z, p.roll, d),
    );
    pin.current!.visible = state !== 'detail' || active;
    if (import.meta.env.DEV && active) Object.assign(gl.domElement.dataset, { opening: motion.current.opening.toFixed(3), pinX: pin.current!.position.x.toFixed(3), pinY: pin.current!.position.y.toFixed(3) });
  }, -1);
  return <>
    <PinTrail motion={motion} mobile={mobile} reducedMotion={reducedMotion} index={index} count={count} aspect={size.width / size.height} />
    <group ref={pin} position={[rest.x, rest.y, rest.z]} rotation={[rest.tilt, rest.turn, rest.roll]} scale={rest.scale}>
      {isCase
        ? <PinCase experience={experience} state={state} active={active} mobile={mobile} reducedMotion={reducedMotion} onClick={event => { event.stopPropagation(); activate(); }} />
        : experience.badge === 'flask'
          ? <EnamelPin onClick={event => { event.stopPropagation(); activate(); }} />
          : <CollectiblePin image={experience.image} badge={experience.badge} onClick={event => { event.stopPropagation(); activate(); }} />}
      {state === 'collection' && <Html position={[0, 0, 0.06]} center zIndexRange={[15, 10]}>
        <button className="pin-hit-target" data-case-id={isCase ? experience.id : undefined} aria-label={experience.company} onClick={activate} />
      </Html>}
    </group>
  </>;
}

function CollectionJar(props: SceneProps & { aspect: number }) {
  const { state, motion, reducedMotion, mobile, onOpen, aspect } = props;
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const glow=useRef(state==='home'?.18:0);
  const rim=useRef<THREE.MeshPhysicalMaterial>(null);
  const {gl,invalidate}=useThree();
  const lid = useRef<THREE.Group>(null);
  const { x, z } = jarPlacement(mobile,aspect);
  const lastOpening = useRef(0);
  const glassGeometry = useMemo(() => {
    const curve = new THREE.SplineCurve([new THREE.Vector2(0.05,0.12),new THREE.Vector2(0.63,0.12),new THREE.Vector2(0.75,0.23),new THREE.Vector2(0.76,1.45),new THREE.Vector2(0.71,1.73),new THREE.Vector2(0.59,1.9),new THREE.Vector2(0.57,2.13)]);
    return new THREE.LatheGeometry(curve.getPoints(70), 80);
  }, []);
  useEffect(() => () => glassGeometry.dispose(), [glassGeometry]);
  useFrame((_,delta) => {
    const target=state==='home'?(hover||focused?1:.18):0;
    glow.current=THREE.MathUtils.lerp(glow.current,target,reducedMotion?1:1-Math.exp(-Math.min(delta,.05)*9));
    if(rim.current)rim.current.emissiveIntensity=glow.current*.9;
    const opening = motion.current.opening;
    const pose = lidPose(opening, mobile, aspect);
    lid.current!.userData.moving = Math.abs(opening - lastOpening.current) > 0.00001;
    lastOpening.current = opening;
    lid.current!.position.set(pose.x, pose.y, pose.z);
    lid.current!.rotation.set(0, pose.turn, pose.tilt);
    if (import.meta.env.DEV) {
      Object.assign(lid.current!.userData, { opening });
      Object.assign(gl.domElement.dataset,{jarGlow:glow.current.toFixed(3),jarHovered:String(hover),jarFocused:String(focused)});
    }
  }, -1);
  const click = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (state === 'home') onOpen(); };
  useEffect(() => { document.body.style.cursor = state==='home'&&hover ? 'pointer' : ''; return () => { document.body.style.cursor = ''; }; }, [hover,state]);
  useEffect(()=>{if(state!=='home'){setHover(false);setFocused(false);}invalidate();},[state,hover,focused,invalidate]);
  return <>
    <group position={[x,0,z]} onClick={click} onPointerOver={e => { e.stopPropagation(); if (state === 'home') setHover(true); }} onPointerOut={() => setHover(false)}>
      <mesh geometry={glassGeometry} renderOrder={2}><GlassMaterial glow={glow}/></mesh>
      <JarEdgeGlow glow={glow} geometry={glassGeometry}/>
      <JarGroundGlow glow={glow} y={groundHeight(x,z)+.08}/>
      <mesh position={[0,0.16,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[0.73,64]} /><meshPhysicalMaterial color="#ffe7ac" transparent opacity={0.3} roughness={0.13} metalness={0.12} depthWrite={false} /></mesh>
      <SuppliedJarPart url={originalModels ? art.jarBase : art.displayJarBase} base position={[0,0.89,0]} />
      <mesh position={[0,1.25,0]}><cylinderGeometry args={[0.88,0.88,2.6,16]}/><meshBasicMaterial visible={false}/></mesh>
      <mesh position={[0,2.1,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[0.575,0.026,10,80]} /><meshPhysicalMaterial ref={rim} color="#fff4dc" emissive="#ffd58a" emissiveIntensity={0} metalness={0.05} roughness={0.16} transparent opacity={0.72} /></mesh>
      <LidShadow lid={lid} mobile={mobile} aspect={aspect}/>
      <group ref={lid} position={[0,2.17,0]}>
        <SuppliedJarPart url={originalModels ? art.lid : art.displayLid} scale={0.9}/>
        <HangingTag lid={lid} reducedMotion={reducedMotion}/>
      </group>
      {state === 'home' && <Html position={[0,1.1,.8]} center zIndexRange={[15,10]} style={{pointerEvents:'none'}}>
        <button className="jar-keyboard-target" aria-label="打开收藏瓶" onClick={onOpen} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}/>
      </Html>}
    </group>
    {experiences.map((experience, index) => <ExperiencePin key={experience.id} {...props} experience={experience} index={index} count={experiences.length} />)}
  </>;
}

function Ready({onReady}: Pick<SceneProps,'onReady'>) {
  const notified = useRef(false);
  const frames=useRef(0);
  useEffect(()=>{loadingPhase('scene-mounted');},[]);
  // Warm the original and cached shader passes before the live scene replaces its still.
  useFrame(({invalidate}) => { if (!notified.current) { if(++frames.current<4){invalidate();return;} notified.current = true; requestAnimationFrame(()=>{loadingPhase('scene-ready');onReady();}); } });
  return null;
}
function World(props: SceneProps) {
  const size=useThree(s=>s.size),aspect=size.width/size.height;
  return <>
    <Meadow mobile={props.mobile} reducedMotion={props.reducedMotion} aspect={aspect}/>
    <ambientLight intensity={0.3} color="#ffe6b7" />
    <hemisphereLight args={['#fff3dc','#a79767',0.85]} />
    <directionalLight position={[-3,9,6]} intensity={2.1} color="#fff4e1" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-13} shadow-camera-right={13} shadow-camera-top={10} shadow-camera-bottom={-10} shadow-camera-near={0.5} shadow-camera-far={35} shadow-bias={-0.00012} shadow-normalBias={0.012} shadow-radius={3}/>
    <directionalLight position={[8,6,-3]} intensity={1.0} color="#ffd085" />
    <Environment resolution={64} frames={1}>
      <Lightformer intensity={1.7} color="#fff2d4" position={[-5,5,6]} scale={[6,8,1]} rotation={[0,Math.PI/4,0]} />
      <Lightformer intensity={2} color="#fff4dc" position={[6,4,2]} scale={[4,7,1]} rotation={[0,-Math.PI/3,0]} />
    </Environment>
    <CameraRig {...props} /><Portrait mobile={props.mobile} aspect={aspect} state={props.state} reducedMotion={props.reducedMotion} /><CollectionJar {...props} aspect={aspect} /><Ready onReady={props.onReady} /><CachedRenderer/>
  </>;
}
function ContextGuard({onFailure}: Pick<SceneProps,'onFailure'>) {
  const {gl} = useThree();
  useEffect(() => {
    const lost = (event: Event) => {event.preventDefault();onFailure();};
    gl.domElement.addEventListener('webglcontextlost',lost);
    return () => gl.domElement.removeEventListener('webglcontextlost',lost);
  },[gl,onFailure]);
  return null;
}
function RenderVisibility({reducedMotion}:{reducedMotion:boolean}) {
  const {setFrameloop,invalidate}=useThree();
  useEffect(()=>{
    const update=()=>{setFrameloop(document.hidden?'never':reducedMotion?'demand':'always');if(!document.hidden)invalidate();};
    update();document.addEventListener('visibilitychange',update);
    return()=>document.removeEventListener('visibilitychange',update);
  },[setFrameloop,invalidate,reducedMotion]);
  return null;
}
export default function KnitScene(props: SceneProps) {
  const diagnosticDpr=import.meta.env.DEV?Number(new URLSearchParams(location.search).get('test-dpr')):0;
  const initial = cameraPose('home',props.mobile,{x:0,y:0},true);
  return <Canvas shadows frameloop={props.reducedMotion ? 'demand' : 'always'} dpr={diagnosticDpr>0 ? diagnosticDpr : props.mobile ? [1,1.5] : [1,1.75]} camera={{position:initial.position,fov:38,near:0.1,far:130}} gl={{antialias:true,alpha:true,powerPreference:'high-performance'}} onCreated={({gl}) => {
    gl.setClearColor(0x000000, 0);
    gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure=1.02;
    gl.domElement.setAttribute('aria-label','hoho 的针织花园与经历收藏瓶，移动鼠标可轻转镜头');
  }}><ContextGuard onFailure={props.onFailure}/><RenderVisibility reducedMotion={props.reducedMotion}/><Suspense fallback={null}><World {...props}/></Suspense></Canvas>;
}
