import Phaser from 'phaser';

const SPACING = 44;
const COLOR_IDLE = '#9e9eb8';
const COLOR_SELECTED = '#ffeb3b';

export interface MenuOption {
  label: string;
  onSelect: () => void;
}

// Lista vertical de opciones que se maneja con teclado (W/S o flechas + ENTER/ESPACIO) o con ratón.
// Solo responde mientras es visible, así varias listas pueden convivir en la misma escena
export class Menu extends Phaser.GameObjects.Container {
  private options: MenuOption[];
  private items: Phaser.GameObjects.Text[];
  private selectedIndex = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, options: MenuOption[]) {
    super(scene, x, y);
    scene.add.existing(this);
    this.options = options;

    this.items = options.map((option, i) => {
      const item = scene.add
        .text(0, i * SPACING, option.label, { fontFamily: 'monospace', fontSize: '24px', color: COLOR_IDLE })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      item.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.select(i));
      item.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.confirm());
      return item;
    });
    this.add(this.items);
    this.select(0);

    scene.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.handleKey);
  }

  destroy(fromScene?: boolean): void {
    this.scene?.input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.handleKey);
    super.destroy(fromScene);
  }

  // Función flecha como propiedad: mantiene "this" y es la misma referencia para on() y off()
  private handleKey = (event: KeyboardEvent): void => {
    if (!this.visible) return;

    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.select((this.selectedIndex - 1 + this.items.length) % this.items.length);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.select((this.selectedIndex + 1) % this.items.length);
        break;
      case 'Enter':
      case 'Space':
        this.confirm();
        break;
    }
  };

  private select(index: number): void {
    this.selectedIndex = index;
    this.items.forEach((item, i) => {
      const selected = i === index;
      item.setColor(selected ? COLOR_SELECTED : COLOR_IDLE);
      item.setText(selected ? `▸ ${this.options[i].label} ◂` : this.options[i].label);
    });
  }

  private confirm(): void {
    // Se ejecuta en el siguiente tick: si la acción muestra otro menú, la misma pulsación
    // de ENTER no debe llegar también a ese menú nuevo y activarlo al instante
    const option = this.options[this.selectedIndex];
    this.scene.time.delayedCall(0, option.onSelect);
  }
}
