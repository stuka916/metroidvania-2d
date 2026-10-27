import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { SCENES } from '../config/sceneKeys';
import { Menu } from '../ui/Menu';
import type { LevelData } from './MainScene';

// Se lanza ENCIMA de MainScene (scene.launch) mientras esta queda en pausa (scene.pause):
// la escena de juego deja de actualizarse —física, enemigos, temporizadores— pero se sigue dibujando debajo
export class PauseScene extends Phaser.Scene {
  private level!: LevelData;
  private escKey!: Phaser.Input.Keyboard.Key;
  private pKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: SCENES.PAUSE });
  }

  // init recibe los datos de scene.launch(): la zona actual, para poder reiniciarla
  init(level: LevelData): void {
    this.level = level;
  }

  create(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6).setOrigin(0);

    this.add
      .text(GAME_WIDTH / 2, 190, 'PAUSA', { fontFamily: 'monospace', fontSize: '40px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);

    new Menu(this, GAME_WIDTH / 2, 290, [
      { label: 'Reanudar', onSelect: () => this.resumeGame() },
      { label: 'Reiniciar zona', onSelect: () => this.restartZone() },
      { label: 'Menú principal', onSelect: () => this.goToMainMenu() },
    ]);

    const keyboard = this.input.keyboard!;
    this.escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.pKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.escKey) || Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.resumeGame();
    }
  }

  private resumeGame(): void {
    this.scene.resume(SCENES.GAME);
    this.scene.stop();
  }

  private restartZone(): void {
    // start() sobre una escena en pausa la apaga y la vuelve a arrancar; y al lanzarlo desde aquí,
    // Phaser detiene también esta escena de pausa
    this.scene.start(SCENES.GAME, this.level);
  }

  private goToMainMenu(): void {
    this.scene.stop(SCENES.GAME);
    this.scene.start(SCENES.MAIN_MENU);
  }
}
