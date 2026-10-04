import {useTexture} from '@react-three/drei';
import {openingImageURL,requireOpeningImages} from './opening-images';

export function useSceneTexture(url:string) {
  requireOpeningImages();
  return useTexture(openingImageURL(url));
}
