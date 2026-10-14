import type { Direction } from './combat';
export type Stage = 'idle' | 'run' | 'attack1' | 'attack2' | 'attack3' | '4a' | '4b' | '4c' | 'vfx';
export const FRAME_COUNTS: Record<Stage, number> = { idle: 6, run: 8, attack1: 8, attack2: 8, attack3: 8, '4a': 6, '4b': 8, '4c': 8, vfx: 8 };
export const FRAME_SIZE: Record<Stage, number> = { idle: 128, run: 128, attack1: 128, attack2: 128, attack3: 128, '4a': 128, '4b': 128, '4c': 128, vfx: 256 };
/** Reconstituição dos 36 atlas extraídos do launcher original.
 * Quatro direções; animações separadas do Meteoro de Pégaso.
 * Mantém sprites completos em células, origem Phaser (.5,.875).
 */
const ATLAS: Record<Stage, Record<Direction,number>> = {
 idle: {down:0,left:1,right:3,up:2},
 run: {down:10,left:27,right:28,up:11},
 attack1: {down:18,left:21,right:19,up:17},
 attack2: {down:20,left:22,right:33,up:29},
 attack3: {down:6,left:23,right:31,up:30},
 '4a': {down:5,left:7,right:9,up:8},
 '4b': {down:24,left:26,right:25,up:32},
 '4c': {down:13,left:14,right:15,up:16},
 vfx: {down:35,left:37,right:36,up:34}
};
export function spriteKey(dir: Direction, stage: Stage): string {return `seiya_${dir}_${stage}`;}
export function spritePath(dir: Direction, stage: Stage): string {
 return `assets/atlas_${String(ATLAS[stage][dir]).padStart(2,'0')}.png`;
}
