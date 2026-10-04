export type SceneState = 'home' | 'collection' | 'detail';
export type SceneAction = 'open' | 'select' | 'back' | 'home';
export function nextScene(state: SceneState, action: SceneAction): SceneState {
  if (action === 'home') return 'home';
  if (action === 'open') return state === 'home' ? 'collection' : state;
  if (action === 'select') return 'detail';
  if (action === 'back') return state === 'detail' ? 'collection' : 'home';
  return state;
}
