import { workCharmPose } from './work-pin-motion.ts';

// The project tote has a taller handle and a lower front than the work case.
export function caseCharmPose(index: number, count: number, expanded: boolean, kind: 'work' | 'projects') {
  const pose = workCharmPose(index, count, expanded);
  if (expanded) return pose;
  // The small pin's back touches the case front instead of hovering above it.
  if (kind === 'work') return { ...pose, z: 0.032 + pose.scale * 0.028 };
  const scale = count === 2 ? 0.32 : pose.scale;
  return { ...pose, x: pose.x * (count === 2 ? 1.45 : 1), y: pose.y - 0.17, scale, z: 0.032 + scale * 0.028 };
}
