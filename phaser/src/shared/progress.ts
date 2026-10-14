import { MAX_HP, MAX_COSMO } from './combat';
export type PlayerProgress={
 version:4; level:number; xp:number; kills:number; drachmas:number;
 hp:number;cosmo:number;infirmary:boolean;healed:boolean;defeats:number;
};
const KEY='saint-seiya-ascensao-cosmo:arena:v04';
const OLD='ss-ascensao-cosmo-standalone-v06';
export const XP_FOR_NEXT_LEVEL=(level:number)=>100+Math.max(1,Math.trunc(level))*25;
const bounded=(n:unknown,min:number,max:number,def:number)=>{
 if(typeof n!=='number'||!Number.isFinite(n))return def;
 return Math.max(min,Math.min(max,Math.floor(n)));
};
export const INITIAL_PROGRESS:PlayerProgress={version:4,level:1,xp:0,kills:0,drachmas:0,hp:MAX_HP,cosmo:55,infirmary:false,healed:false,defeats:0};
export function sanitizeProgress(p:unknown):PlayerProgress{
 const v=p&&typeof p==='object'?p as Record<string,unknown>:{};
 const level=bounded(v.level,1,99,1);
 const infirmary=!!v.infirmary;
 const healed=infirmary&&!!v.healed;
 return {
 version:4,level,
 xp:bounded(v.xp,0,XP_FOR_NEXT_LEVEL(level)-1,0),
 kills:bounded(v.kills,0,999999,0),
 drachmas:bounded(v.drachmas??v.coins,0,99999999,0),
 hp:infirmary?(healed?MAX_HP:0):bounded(v.hp,0,MAX_HP,MAX_HP),
 cosmo:infirmary&&healed?MAX_COSMO:bounded(v.cosmo,0,MAX_COSMO,55),
 infirmary,healed,defeats:bounded(v.defeats,0,999999,0)
 };
}
export function readProgress():PlayerProgress{
 try{
  const data=localStorage.getItem(KEY);
  if(data)return sanitizeProgress(JSON.parse(data));
  const legacy=localStorage.getItem(OLD);
  if(legacy){const p=sanitizeProgress(JSON.parse(legacy));writeProgress(p);return p;}
 }catch(e){console.warn('Salvamento não pôde ser lido',e);}
 return {...INITIAL_PROGRESS};
}
export function writeProgress(p:PlayerProgress):void{
 try{localStorage.setItem(KEY,JSON.stringify(sanitizeProgress(p)));}
 catch(e){console.warn('Salvamento não pôde ser gravado',e);}
}
export function onDefeat(p:PlayerProgress):PlayerProgress{
 const q=sanitizeProgress(p);if(q.infirmary)return q;
 return {...q,hp:0,infirmary:true,healed:false,defeats:q.defeats+1};
}
export function healAtInfirmary(p:PlayerProgress):PlayerProgress{
 const q=sanitizeProgress(p);
 return q.infirmary?{...q,hp:MAX_HP,cosmo:MAX_COSMO,healed:true}:q;
}
export function leaveInfirmary(p:PlayerProgress):PlayerProgress{
 const q=sanitizeProgress(p);
 return q.infirmary&&q.healed?{...q,infirmary:false,healed:false,hp:MAX_HP,cosmo:MAX_COSMO}:q;
}
