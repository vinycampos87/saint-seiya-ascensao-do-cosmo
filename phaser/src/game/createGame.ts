import Phaser from 'phaser';
import { TrainingScene } from './TrainingScene';
export function createGame(
  parent: HTMLElement,
  onGameReady: (scene: TrainingScene) => void,
  onAssetError?: (message: string) => void
): Phaser.Game {
  const scene = new TrainingScene();
  scene.onAssetError = onAssetError;
  // Do not access scene.events before Phaser boots the Scene.
  // Phaser creates the Scene event emitter during boot. TrainingScene.create()
  // calls this callback only after the world, player and enemies exist.
  scene.onSceneReady = () => onGameReady(scene);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1600,
    height: 900,
    backgroundColor: '#0b1724',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    render: {pixelArt:true,antialias:false},
    scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
    audio: {disableWebAudio:true}
  });
  return game;
}