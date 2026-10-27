import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/constants';
import { SCENES } from '../config/sceneKeys';
import { resetWorldFlags } from '../state/worldState';
import { Menu } from '../ui/Menu';
import type { LevelData } from './MainScene';

const FADE_MS = 300;

const CONTROLS: [string, string][] = [
  ['A / D', 'Moverse'],
  ['ESPACIO', 'Saltar (otra vez en el aire: doble salto)'],
  ['Contra una pared', 'Mantén la dirección para deslizarte'],
  ['ESPACIO en pared', 'Wall jump'],
  ['SHIFT', 'Dash'],
  ['J', 'Atacar (también activa palancas)'],
  ['W', 'Entrar por una puerta'],
  ['ESC / P', 'Pausa'],
];

export class MainMenuScene extends Phaser.Scene {
  private mainMenu!: Menu;
  private controlsPanel!: Phaser.GameObjects.Container;
  private isStarting = false;

  constructor() {
    super({ key: SCENES.MAIN_MENU });
  }

  create(): void {
    this.isStarting = false;
    this.cameras.main.fadeIn(FADE_MS);

    this.add
      .text(GAME_WIDTH / 2, 170, 'METROIDVANIA 2D', {
        fontFamily: 'monospace',
        fontSize: '48px',
        color: '#4fc3f7',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 225, 'prototipo', { fontFamily: 'monospace', fontSize: '18px', color: '#9e9eb8' })
      .setOrigin(0.5);

    this.mainMenu = new Menu(this, GAME_WIDTH / 2, 340, [
      { label: 'Jugar', onSelect: () => this.startGame() },
      { label: 'Controles', onSelect: () => this.showControls(true) },
    ]);

    this.controlsPanel = this.createControlsPanel().setVisible(false);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'W/S o flechas para elegir · ENTER para confirmar', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#5c5c80',
      })
      .setOrigin(0.5);
  }

  private createControlsPanel(): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0);
    const lineStyle = { fontFamily: 'monospace', fontSize: '16px' };

    panel.add(this.add.rectangle(GAME_WIDTH / 2, 380, 640, 330, 0x000000, 0.75).setStrokeStyle(1, 0x5c5c80));

    CONTROLS.forEach(([keys, action], i) => {
      const y = 240 + i * 28;
      panel.add(this.add.text(GAME_WIDTH / 2 - 20, y, keys, { ...lineStyle, color: '#ffeb3b' }).setOrigin(1, 0));
      panel.add(this.add.text(GAME_WIDTH / 2, y, action, { ...lineStyle, color: '#ffffff' }));
    });

    // Un Menu dentro de otro contenedor: al ocultar el panel, el Menu deja de responder al teclado
    panel.add(new Menu(this, GAME_WIDTH / 2, 500, [{ label: 'Volver', onSelect: () => this.showControls(false) }]));
    return panel;
  }

  private showControls(visible: boolean): void {
    this.controlsPanel.setVisible(visible);
    this.mainMenu.setVisible(!visible);
  }

  private startGame(): void {
    if (this.isStarting) return;
    this.isStarting = true;

    // Partida nueva: palancas y barreras vuelven a su estado inicial
    resetWorldFlags(this.registry);

    const level: LevelData = { map: 'level1', spawn: 'start' };
    this.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENES.GAME, level);
    });
  }
}
