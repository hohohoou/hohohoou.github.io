import {isLidLandingArea} from './lid-motion.ts';
import {groundHeight, isRestingArea, jarPlacement} from './world-layout.ts';

export type Flower = {x:number;y:number;z:number;scale:number;radius:number;kind:number;rotation:[number,number,number]};
export function seededRandom(seed:number) {
  return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
}

export function flowerLayout(mobile:boolean,aspect=2): Flower[] {
  const random=seededRandom(52119), flowers:Flower[]=[], counts=[0,0,0];
  const jar=jarPlacement(mobile,aspect);
  const add=(x:number,z:number) => {
    const scale = z>2 ? .67+random()*.32 : z>-8 ? .40+random()*.27 : .31+random()*.30;
    // Includes the full head, leaf spread, lean and maximum wind envelope.
    const radius=scale*.49+.045;
    if(isLidLandingArea(x,z,mobile,aspect,radius))return;
    if(isRestingArea(x,z,mobile,radius+.10,aspect))return;
    if(z>jar.z && z<jar.z+4 && Math.abs(x-jar.x)<.84+radius*.35)return;
    const neighbors=flowers.filter(f=>Math.abs(x-f.x)<2.8&&Math.abs(z-f.z)<2.8);
    if(neighbors.some(f=>Math.hypot(x-f.x,z-f.z)<radius+f.radius+.065))return;
    const start=Math.floor(random()*3), local=[0,0,0];
    for(const f of neighbors) local[f.kind]+=Math.max(0,2.8-Math.hypot(x-f.x,z-f.z));
    let kind=start;
    for(let i=1;i<3;i++){const k=(start+i)%3;if(local[k]+counts[k]*.018<local[kind]+counts[kind]*.018)kind=k;}
    flowers.push({x,y:groundHeight(x,z)-.035,z,scale,radius,kind,rotation:[-.04+random()*.08,(random()-.5)*.65,(random()-.5)*.12]});counts[kind]++;
  };
  // Give the right/rear bank its own coverage before filling the wider meadow.
  for(let i=0;i<480;i++)add(6+random()*9,-8+random()*10);
  // Jittered cells avoid accidental bare patches without producing rows.
  for(let z=-24;z<9;z+=.82)for(let x=-19;x<20;x+=.82)add(x+random()*.82,z+random()*.82);
  // Art-direct only the orange flower identified in the wide-screen reference.
  // Do this after generation to preserve every surrounding flower and the RNG sequence.
  const orange=flowers.find(f=>f.kind===2&&Math.abs(f.x+2.5760069)<.0001&&Math.abs(f.z-4.7266675)<.0001);
  if(orange){orange.scale=.58;orange.radius=orange.scale*.49+.045;}
  return flowers;
}
