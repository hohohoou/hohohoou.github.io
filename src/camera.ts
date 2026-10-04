import type { SceneState } from './state';

export type Point3 = [number, number, number];
export function normalizedPointer(clientX: number, clientY: number, width: number, height: number) {
  return { x: Math.max(-1, Math.min(1, clientX / Math.max(width, 1) * 2 - 1)), y: Math.max(-1, Math.min(1, 1 - clientY / Math.max(height, 1) * 2)) };
}
export function cameraPose(state: SceneState, mobile: boolean, pointer: {x: number; y: number}, reduced: boolean): {position: Point3; target: Point3} {
  let position: Point3, target: Point3;
  if (mobile) {
    if (state === 'detail') { position = [-3.2, 3.3, 9.3]; target = [-3.2, 2.0, 1]; }
    else if (state === 'collection') { position = [-0.7, 4.3, 18]; target = [-0.7, 2.85, 0.4]; }
    else { position = [-0.6, 4.6, 19.5]; target = [-0.6, 2.85, 0]; }
  } else {
    if (state === 'detail') { position = [-1.3, 3.2, 8.4]; target = [-1.3, 2.2, 0.8]; }
    else if (state === 'collection') { position = [-0.5, 4.0, 12.7]; target = [-0.5, 2.05, 0.5]; }
    else { position = [0, 4.1, 13.7]; target = [0, 2.1, 0]; }
  }
  if (state !== 'detail' && !mobile && !reduced) {
    const yaw = pointer.x * 0.048;
    const distance = position[2] - target[2];
    position[0] += Math.sin(yaw) * distance;
    position[2] = target[2] + Math.cos(yaw) * distance;
    position[1] += pointer.y * 0.18;
    target[0] += pointer.x * 0.12;
    target[1] += pointer.y * 0.035;
  }
  return {position, target};
}
