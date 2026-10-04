import type { ThreeEvent } from '@react-three/fiber';
import type { Experience } from './content';
import type { SceneState } from './state';
import { PinArtwork } from './PinArtwork';
import { StoryPin } from './StoryPin';
import workOutlines from './work-pin-outlines.json';
import projectOutlines from './project-pin-outlines.json';

export function PinCase({ experience, reducedMotion, onClick, state, active, mobile }: {
  experience: Experience; reducedMotion: boolean;
  state: SceneState; active: boolean; mobile: boolean;
  onClick: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const entries = experience.entries.filter(entry => entry.pin);
  return <group onClick={onClick}>
    <PinArtwork image={experience.image} contour={experience.pinCase === 'projects' ? projectOutlines.kit : workOutlines.case} metal="#c5a46c" />
    {entries.map((entry, index) => <StoryPin key={entry.id} entry={entry} index={index} count={entries.length} kind={experience.pinCase!}
      state={state} active={active} mobile={mobile} reducedMotion={reducedMotion} />)}
  </group>;
}
