import {groundHeight,jarPlacement} from './world-layout.ts';

export const LID_DURATION=1.7;
export function lidLanding(mobile:boolean,aspect=2){
  const jar=jarPlacement(mobile,aspect),compact=aspect<1.6;
  // Follow the bottle forward so the open cap remains beside it in the composition.
  const advance=(jar.z-1.7)/.7;
  const worldX=mobile?-1.65:compact?-3.73:-5.3;
  const worldZ=mobile?4.3:compact?3.75:2.25+.55*advance;
  return {x:worldX-jar.x,z:worldZ-jar.z,y:groundHeight(worldX,worldZ)+.43};
}
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
export function lidPose(progress:number,mobile:boolean,aspect=2){
  const p=Math.max(0,Math.min(1,progress)),end=lidLanding(mobile,aspect);
  const lift=smooth(p/.25),travel=smooth((p-.25)/.40),lower=smooth((p-.65)/.35);
  return {x:end.x*travel,z:end.z*travel,y:2.17+.78*lift+(end.y-2.95)*lower,
    tilt:Math.sin(Math.PI*p)*.14,turn:-.14*travel};
}

export function isLidLandingArea(x:number,z:number,mobile:boolean,aspect=2,margin=0){
  // Keep the established meadow pocket fixed: moving the cap within it must not
  // reseed the flower field or remove surrounding plants.
  const compact=aspect<1.6,worldX=mobile?-1.65:compact?-3.73:-5.3;
  const worldZ=mobile?4.3:compact?3.75:2.25;
  return Math.hypot((x-worldX)/(mobile?1.6:1.25),(z-worldZ-.45)/(mobile?2:1.65))<1+margin;
}
