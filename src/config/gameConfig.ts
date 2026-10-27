import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { PreloadScene } from '../scenes/PreloadScene';
import { MainScene } from '../scenes/MainScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,            // WebGL si está disponible, si no Canvas
  parent: 'game',               // id del <div> contenedor
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1d1d2b',
  pixelArt: true,               // sin suavizado: ideal para sprites pixel art
  scale: {
    mode: Phaser.Scale.FIT,     // adaptativo: escala manteniendo 800x600
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: true,              // muestra los cuerpos de colisión; ponlo a false al final
    },
  },
  // La primera escena de la lista es la que arranca: PreloadScene carga y luego lanza MainScene
  scene: [PreloadScene, MainScene],
};
