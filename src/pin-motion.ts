import { PIN_REST_Y, jarPlacement } from './world-layout.ts';
import { clamp01 } from './journey.ts';
import { cameraPose } from './camera.ts';
import { PerspectiveCamera, Vector3 } from 'three';

const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };

// Bottle-local rests: rear keepsakes lean up, front keepsakes lie across them.
// Heights follow the enamel contours and thickness, with the bottom at y=0.16.
const bottleRests = [
  { x: -0.30, y: 0.40192, z: -0.23, tilt: -0.50, turn: -0.26, roll: -0.22 },
  { x: 0.26, y: 0.35430, z: -0.25, tilt: -0.73, turn: 0.18, roll: 0.25 },
  { x: -0.04, y: 0.39439, z: -0.03, tilt: -0.48, turn: -0.18, roll: -0.20 },
  { x: -0.31, y: 0.26634, z: 0.24, tilt: -1.05, turn: 0.16, roll: 0.26 },
  { x: 0.29, y: 0.32524, z: 0.25, tilt: -1.18, turn: -0.25, roll: -0.22 },
  { x: 0.02, y: 0.39466, z: 0.38, tilt: -0.74, turn: 0.10, roll: 0.08 },
];

// Lift inside the mouth first, then fan out in content order along an open arc.
export function pinLaunchPose(opening: number, mobile: boolean, index = 0, count = 1, aspect = mobile ? 0.5 : 2) {
  const jar = jarPlacement(mobile,aspect);
  const chapters = count > 5;
  // The exposed front of the pile leaves first; chapter destinations keep their order.
  const delay = count > 1 ? (chapters ? count - 1 - index : index) / (count - 1) * 0.06 : 0;
  const lift = smooth((opening - 0.53 - delay) / 0.27);
  const fan = smooth((opening - 0.8 - delay) / (0.2 - delay));
  const slot = index - (count - 1) / 2;
  // Six chapter keepsakes need a bounded arrangement; a single endless row
  // would send the outer pins off narrow viewports. Mobile reads left-to-right
  // across two rows, matching the chapter directory and document order.
  const span = Math.min(7, 6.8 * aspect * 0.76);
  const destinationX = mobile
    ? -0.7 + (index % 3 - 1) * Math.min(1.8, aspect * 3.9)
    : -0.5 + slot / Math.max(1, count - 1) * span;
  const destinationY = mobile ? 5.2 - Math.floor(index / 3) * 1.4 : 3.7 + (1 - (slot / Math.max(1, (count - 1) / 2)) ** 2) * 0.65;
  const rest = bottleRests[index % bottleRests.length];
  const restY = chapters ? rest.y : PIN_REST_Y;
  // Clear the pile vertically before gathering under the mouth. Keep the small
  // bottle scale through the shoulder, then grow above the rim.
  const gather = smooth((lift - 0.1) / 0.45);
  const grow = smooth((lift - 0.66) / 0.34);
  return {
    x: chapters ? jar.x + rest.x * (1 - gather) + (destinationX - jar.x) * fan : jar.x - 0.08 * (1 - lift) + slot * 1.05 * fan,
    y: restY + (2.83 - restY) * lift + (chapters ? (destinationY - 2.83) * fan : (0.18 - Math.abs(slot) * 0.12) * Math.sin(Math.PI * fan)),
    // Keep the open collection's depth fixed while the bottle moves on the ground.
    z: jar.z + (chapters ? rest.z * (1 - gather) + 0.08 * gather : 0.1 - 0.02 * lift + Math.abs(slot) * 0.12 * fan) + (1.7 - jar.z) * fan,
    scale: chapters ? 0.55 + (mobile ? 0.55 : 0.4) * grow : 0.69 + 0.26 * lift,
    turn: chapters ? rest.turn * (1 - lift) + 0.06 * lift : -0.16 + 0.22 * lift,
    tilt: (chapters ? rest.tilt : -0.85) * (1 - lift),
    roll: chapters ? rest.roll * (1 - lift) - 0.04 * lift : -0.26 + 0.22 * lift,
    lift,
  };
}

export function readingPinPose(mobile: boolean, aspect: number) {
  const pose = cameraPose('detail', mobile, { x: 0, y: 0 }, true);
  const camera = new PerspectiveCamera(38, aspect, 0.1, 130);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  const direction = new Vector3(mobile ? 0 : -0.47, mobile ? 0.52 : 0.08, 0.5).unproject(camera).sub(camera.position).normalize();
  const position = camera.position.clone().addScaledVector(direction, (3.05 - camera.position.z) / direction.z);
  const worldWidth = 2 * (camera.position.z - 3.05) * Math.tan(19 * Math.PI / 180) * aspect;
  return { position, scale: Math.min(mobile ? 1 : 1.7, worldWidth * (mobile ? 0.24 : 0.28) / 1.05) };
}

export function workCasePose(mobile: boolean, aspect: number) {
  const pose = cameraPose('collection', mobile, { x: 0, y: 0 }, true);
  const camera = new PerspectiveCamera(38, aspect, 0.1, 130);
  camera.position.set(...pose.position);
  camera.lookAt(new Vector3(...pose.target));
  camera.updateMatrixWorld();
  const direction = new Vector3(0, mobile && aspect < 0.5 ? 0.13 : aspect > 2 ? -0.20 : -0.02, 0.5).unproject(camera).sub(camera.position).normalize();
  const z = 4;
  const position = camera.position.clone().addScaledVector(direction, (z - camera.position.z) / direction.z);
  const height = 2 * (camera.position.z - z) * Math.tan(19 * Math.PI / 180);
  const scale = Math.min(height * 0.29, height * aspect * (mobile ? 0.50 : 0.32));
  return { position, scale };
}
