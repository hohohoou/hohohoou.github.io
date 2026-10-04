import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';

// Static models use their selected display geometry and authored materials. The cache
// stores full-resolution color AND depth, so moving flowers/glass share the same space.
export function CachedRenderer(){
  const {gl,invalidate,raycaster}=useThree();
  const state=useRef({valid:false,steady:0,signature:'',environment:null as THREE.Texture|null,view:new THREE.Matrix4(),previous:new THREE.Matrix4().makeScale(0,0,0),modelMatrices:new Map<number,THREE.Matrix4>(),size:new THREE.Vector2(),refreshes:0});
  const performance=useRef({last:'',direct:{frames:0,seconds:0,max:0},reused:{frames:0,seconds:0,max:0}});
  const resources=useMemo(()=>{
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,samples:4,depthBuffer:true});
    target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    target.texture.minFilter=target.texture.magFilter=THREE.NearestFilter;
    const material=new THREE.ShaderMaterial({uniforms:{tColor:{value:target.texture},tDepth:{value:target.depthTexture}},
      vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:`uniform sampler2D tColor;uniform sampler2D tDepth;varying vec2 vUv;
      void main(){vec4 c=texture2D(tColor,vUv);if(c.a<0.001)discard;
        gl_FragDepth=texture2D(tDepth,vUv).x;gl_FragColor=vec4(c.rgb/max(c.a,0.001),c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,transparent:true,depthWrite:true,depthTest:true,toneMapped:true});
    const geometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(geometry,material),scene=new THREE.Scene();quad.frustumCulled=false;scene.add(quad);
    return {target,material,geometry,scene,camera:new THREE.Camera()};
  },[]);
  useEffect(()=>{const mask=raycaster.layers.mask;raycaster.layers.enableAll();return()=>{raycaster.layers.mask=mask;};},[raycaster]);
  useEffect(()=>()=>{resources.target.dispose();resources.material.dispose();resources.geometry.dispose();gl.info.autoReset=true;},[resources,gl]);
  useFrame(({scene,camera},delta)=>{
    if(import.meta.env.DEV){
      const p=performance.current,key=p.last as 'direct'|'reused';
      if(key){const sample=p[key];sample.frames++;sample.seconds+=delta;sample.max=Math.max(sample.max,delta);
        if(sample.seconds>=1){gl.domElement.dataset[key+'Fps']=(sample.frames/sample.seconds).toFixed(1);gl.domElement.dataset[key+'MaxMs']=(sample.max*1000).toFixed(1);sample.frames=0;sample.seconds=0;sample.max=0;}}
    }
    const s=state.current;camera.updateMatrixWorld();scene.updateMatrixWorld();
    if(s.environment!==scene.environment){s.valid=false;s.environment=scene.environment;}
    s.view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const cameraChanged=!s.view.equals(s.previous);s.previous.copy(s.view);s.steady=cameraChanged?0:s.steady+1;
    gl.getDrawingBufferSize(s.size);
    if(resources.target.width!==s.size.x||resources.target.height!==s.size.y){resources.target.setSize(s.size.x,s.size.y);s.valid=false;}
    let signature='',modelsChanged=false;
    scene.traverse(object=>{
      if(object instanceof THREE.Light){object.layers.enableAll();return;}
      if(!(object instanceof THREE.Mesh))return;
      const moving=object.userData.cacheStatic && object.parent?.parent?.userData.moving;
      if(object.userData.cacheStatic&&!moving){
        object.layers.set(1);signature+=object.id+',';
        const previous=s.modelMatrices.get(object.id);
        if(!previous||!previous.equals(object.matrixWorld)){modelsChanged=true;s.modelMatrices.set(object.id,object.matrixWorld.clone());}
      }else{
        const materials=Array.isArray(object.material)?object.material:[object.material];
        object.layers.set(materials.some(m=>m.transparent)?2:0);
      }
    });
    if(cameraChanged||modelsChanged||signature!==s.signature){s.valid=false;s.signature=signature;}
    gl.info.autoReset=false;gl.info.reset();
    const mask=camera.layers.mask,background=scene.background,autoClear=gl.autoClear;
    const disabled=import.meta.env.DEV&&new URLSearchParams(location.search).has('test-no-cache');
    // Camera motion uses the original single pass; a still camera reuses exact depth.
    if(disabled||s.steady<2||!gl.extensions.has('EXT_color_buffer_float')){
      performance.current.last='direct';
      camera.layers.enableAll();gl.autoClear=true;gl.render(scene,camera);camera.layers.mask=mask;
      gl.autoClear=autoClear;if(s.steady<2)invalidate();
      if(import.meta.env.DEV)Object.assign(gl.domElement.dataset,{cache:'direct',cacheRefreshes:String(s.refreshes)});
      return;
    }
    if(!s.valid){
      camera.layers.set(1);scene.background=null;gl.autoClear=true;
      const clear=new THREE.Color();gl.getClearColor(clear);const alpha=gl.getClearAlpha();gl.setClearColor(0,0);
      gl.setRenderTarget(resources.target);gl.render(scene,camera);gl.setRenderTarget(null);
      gl.setClearColor(clear,alpha);scene.background=background;s.valid=true;s.refreshes++;
    }
    performance.current.last='reused';
    gl.autoClear=true;camera.layers.set(0);gl.render(scene,camera);
    gl.autoClear=false;gl.render(resources.scene,resources.camera);
    camera.layers.set(2);scene.background=null;gl.render(scene,camera);
    scene.background=background;camera.layers.mask=mask;gl.autoClear=autoClear;
    if(import.meta.env.DEV)Object.assign(gl.domElement.dataset,{cache:'reused',cacheRefreshes:String(s.refreshes)});
  },1);
  return null;
}
