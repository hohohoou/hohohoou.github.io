import footprint from './portrait-footprint.json' with {type:'json'};
// All set pieces use this ground plane. Hills rise outside the resting area.
export const GROUND_Y = 0;
// The beveled pin's lowest point is 0.219284 below its origin in this resting pose.
export const PIN_FLOOR_Y = 0.16;
export const PIN_REST_Y = PIN_FLOOR_Y + 0.219284;
export const PIN_REST_ROTATION: [number,number,number] = [-0.85,-0.16,-0.26];
export function groundHeight(x: number, z: number) {
  const edge = Math.max(0, Math.min(1, (Math.hypot((x - 1.5) / 11, z / 6) - 0.8) / 0.7));
  const blend = edge * edge * (3 - 2 * edge);
  let landing=1;
  // Soft, level landing pockets support the cap and its attached paper tag.
  for(const [cx,cz] of [[-5.3,2.7],[-3.73,4.15],[-1.65,4.75]]){
    const t=Math.max(0,Math.min(1,(Math.hypot((x-cx)/1.35,(z-cz)/1.5)-1)/.7));
    landing*=t*t*(3-2*t);
  }
  return -0.018 + landing * blend * (0.8 + 0.65 * Math.sin(x * 0.26 + z * 0.19) + 0.35 * Math.cos(z * 0.43 - x * 0.17));
}
export function portraitPlacement(mobile: boolean, aspect=2) {
  const scale = mobile ? 4.8 : 5.8;
  return {scale, x: mobile ? 2.6 : 4.88+Math.max(0,aspect-2)*6, y: GROUND_Y + 0.448182 * scale, z: -0.55};
}
export function jarPlacement(mobile: boolean, aspect=2) {
  // Move along the ground toward the lower-left of the camera, easing out on narrow desktops.
  const shift = mobile ? 0 : Math.max(0, Math.min(1, (aspect - 1.3) / .3));
  // The compact layout's cap rests in front, so only move closer once it rests to the left.
  const forward = mobile ? 0 : Math.max(0, Math.min(1, (aspect - 1.6) / .15));
  return {x: mobile ? -2.05 : -3.35 - .5 * shift + .15 * forward * (2 - forward), y: GROUND_Y, z: 1.7 + .7 * forward};
}

// Conservative footprint derived from every source vertex, including the sleeves.
export function isRestingArea(x: number, z: number, mobile: boolean, margin = 0.3, aspect=2) {
  const portrait = portraitPlacement(mobile,aspect);
  const dx = x - portrait.x, dz = z - portrait.z;
  const localX = (dx * Math.cos(0.04) + dz * Math.sin(0.04)) / portrait.scale;
  const localZ = (-dx * Math.sin(0.04) + dz * Math.cos(0.04)) / portrait.scale;
  let inside = false, distance = Infinity;
  for (let i=0,j=footprint.length-1;i<footprint.length;j=i++) {
    const [ax,az]=footprint[j], [bx,bz]=footprint[i];
    if ((az>localZ)!==(bz>localZ) && localX<(bx-ax)*(localZ-az)/(bz-az)+ax) inside=!inside;
    const t=Math.max(0,Math.min(1,((localX-ax)*(bx-ax)+(localZ-az)*(bz-az))/((bx-ax)**2+(bz-az)**2)));
    distance=Math.min(distance,Math.hypot(localX-ax-t*(bx-ax),localZ-az-t*(bz-az)));
  }
  const body = inside || distance*portrait.scale < margin;
  const jar = jarPlacement(mobile,aspect);
  return body || Math.hypot(x - jar.x, z - jar.z) < 1.05 + margin;
}
