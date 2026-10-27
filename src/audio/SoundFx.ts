import Phaser from 'phaser';
import type { SfxKey } from '../config/assets';

// Paneo máximo: a ±1 el sonido sale solo por un altavoz, que resulta brusco
const MAX_PAN = 0.7;
// A partir del borde de la pantalla el volumen cae hasta 0 en esta distancia (en anchos de media pantalla)
const OFFSCREEN_FALLOFF = 1.5;

export interface SfxOptions {
  // Posición X en el mundo de quien produce el sonido: decide el paneo estéreo y el volumen
  x?: number;
  // Variación de tono en cents (100 = un semitono)
  detune?: number;
  volume?: number;
}

export class SoundFx {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  play(key: SfxKey, options: SfxOptions = {}): void {
    let pan = 0;
    let volume = options.volume ?? 1;

    if (options.x !== undefined) {
      const camera = this.scene.cameras.main;
      // -1 = borde izquierdo de la pantalla, 1 = borde derecho
      const offset = (options.x - camera.midPoint.x) / (camera.width / 2);
      pan = Phaser.Math.Clamp(offset, -1, 1) * MAX_PAN;

      const beyondScreen = Math.max(0, Math.abs(offset) - 1);
      volume *= Math.max(0, 1 - beyondScreen / OFFSCREEN_FALLOFF);
    }

    if (volume <= 0) return;
    this.scene.sound.play(key, { volume, pan, detune: options.detune ?? 0 });
  }
}
