import { useEffect, useMemo } from 'react';
import {useSceneTexture} from './scene-texture';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';

export function PinArtwork({ image, contour, metal = '#c89835', onClick }: {
  image: string; contour: { outline: number[][]; holes: number[][][] }; metal?: string;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const texture = useSceneTexture(image);
  useEffect(() => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; texture.needsUpdate = true; }, [texture]);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape(contour.outline.map(([x, y]) => new THREE.Vector2(x, y)));
    shape.holes = contour.holes.map(points => new THREE.Path(points.map(([x, y]) => new THREE.Vector2(x, y))));
    const value = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.003, bevelThickness: 0.004 });
    value.translate(0, 0, -0.024);
    return value;
  }, [contour]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <group onClick={onClick}>
    <mesh geometry={geometry}><meshStandardMaterial color={metal} metalness={0.72} roughness={0.28} /></mesh>
    <mesh position={[0, 0, 0.03]}>
      <planeGeometry args={[1.05, 1.05]} />
      <meshBasicMaterial map={texture} transparent alphaTest={0.15} toneMapped={false} />
    </mesh>
  </group>;
}
