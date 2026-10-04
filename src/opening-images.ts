import pack from 'virtual:hoho-opening-images';
import {fetchModelTransport} from './model-transport';
import {loadingPhase} from './loading-metrics';

const images=new Map<string,string>();
let pending: Promise<void> | undefined;
let ready=!pack;
let failure: unknown;

export function prepareOpeningImages(): Promise<void> {
  const selected=pack;
  if (!selected) return Promise.resolve();
  return pending ??= fetchModelTransport(selected.transport).then(buffer=>{
    for(const entry of selected.entries){
      if(entry.byteOffset<0 || entry.byteLength<1 || entry.byteOffset+entry.byteLength>buffer.byteLength)throw new Error('Invalid opening image range');
      images.set(entry.url,URL.createObjectURL(new Blob([buffer.slice(entry.byteOffset,entry.byteOffset+entry.byteLength)],{type:'image/webp'})));
    }
    ready=true;loadingPhase('opening-images-ready');
  }).catch(error=>{failure=error;throw error;});
}

export function requireOpeningImages() {
  if(failure)throw failure;
  if(!ready)throw prepareOpeningImages();
}

// Reuse the same decoded image URL for 3D and DOM badges; keep ordinary URLs in dev
// and in the existing static fallback when a bundle could not be downloaded.
export const openingImageURL=(url:string)=>images.get(url)??url;
