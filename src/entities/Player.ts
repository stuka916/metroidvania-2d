import Phaser from 'phaser';

const TEXTURE_KEY = 'player';
const WIDTH = 24;
const HEIGHT = 40;

const MOVE_SPEED = 220;
const JUMP_VELOCITY = -480;
const DOUBLE_JUMP_VELOCITY = -420;
// Saltos totales antes de tocar el suelo (1 desde el suelo + 1 en el aire)
const MAX_JUMPS = 2;
// Al soltar el salto mientras sube, la velocidad vertical se multiplica por este factor (salto variable)
const JUMP_CUT_FACTOR = 0.45;

const DASH_SPEED = 600;
const DASH_DURATION_MS = 150;
const DASH_COOLDOWN_MS = 600;
const DASH_TINT = 0xfff176;

// Velocidad máxima de caída mientras se desliza por una pared
const WALL_SLIDE_MAX_FALL_SPEED = 90;
const WALL_JUMP_VELOCITY_X = 280;
const WALL_JUMP_VELOCITY_Y = -460;
// Tras un wall jump se ignora el input horizontal un instante; si no, mantener la tecla hacia la pared
// anularía el impulso en el mismo frame y el jugador se quedaría pegado
const WALL_JUMP_INPUT_LOCK_MS = 160;

const ATTACK_WIDTH = 40;
const ATTACK_HEIGHT = 32;
const ATTACK_DURATION_MS = 100;
const ATTACK_COOLDOWN_MS = 300;
const ATTACK_DAMAGE = 1;
const ATTACK_COLOR = 0xffffff;

const MAX_HEALTH = 5;
// Tras recibir daño: invulnerabilidad temporal (iframes) con parpadeo
const INVULNERABLE_MS = 1000;
const BLINK_INTERVAL_MS = 80;
// Retroceso al recibir daño; durante KNOCKBACK_LOCK_MS el jugador no controla el movimiento horizontal
const KNOCKBACK_VELOCITY_X = 260;
const KNOCKBACK_VELOCITY_Y = -260;
const KNOCKBACK_LOCK_MS = 250;
const HURT_TINT = 0xff5252;

// Eventos que emite el Player para que la escena / HUD reaccionen sin que el Player los conozca
export const PlayerEvents = {
  HEALTH_CHANGED: 'player-health-changed', // (health: number, maxHealth: number)
  JUMPED: 'player-jumped', // (kind: JumpKind)
  DASHED: 'player-dashed',
  ATTACKED: 'player-attacked',
  DAMAGED: 'player-damaged',
  DIED: 'player-died',
} as const;

export type JumpKind = 'ground' | 'air' | 'wall';

type Direction = -1 | 1;

interface PlayerKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  jump: Phaser.Input.Keyboard.Key;
  dash: Phaser.Input.Keyboard.Key;
  attack: Phaser.Input.Keyboard.Key;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  readonly attackDamage = ATTACK_DAMAGE;
  readonly maxHealth = MAX_HEALTH;

  private keys: PlayerKeys;

  private currentHealth = MAX_HEALTH;
  private invulnerableUntil = 0;
  private hurtUntil = 0;
  private isDead = false;

  private jumpsRemaining = MAX_JUMPS;
  // Un solo dash por cada vez que está en el aire; se recarga al tocar el suelo o una pared
  private hasAirDash = true;
  private isDashing = false;
  private dashEndTime = 0;
  private nextDashTime = 0;

  // Pared en contacto estando en el aire: -1 izquierda, 1 derecha, 0 ninguna
  private wallDirection: -1 | 0 | 1 = 0;
  private isWallSliding = false;
  private horizontalInputLockedUntil = 0;

  private attackHitbox: Phaser.GameObjects.Rectangle;
  private isAttacking = false;
  private attackEndTime = 0;
  private nextAttackTime = 0;
  private attackDirection: Direction = 1;
  // Objetivos ya golpeados en el ataque actual: cada golpe hace daño una sola vez
  private hitTargets = new Set<Phaser.GameObjects.GameObject>();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Player.createPlaceholderTexture(scene);
    super(scene, x, y, TEXTURE_KEY);

    // Registrar el sprite en la escena (render + update) y en el motor de físicas
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);

    // Zona de impacto visible: solo se muestra mientras dura el ataque
    this.attackHitbox = scene.add
      .rectangle(0, 0, ATTACK_WIDTH, ATTACK_HEIGHT, ATTACK_COLOR, 0.45)
      .setVisible(false);

    const keyboard = scene.input.keyboard!;
    const { A, D, SPACE, SHIFT, J } = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      left: keyboard.addKey(A),
      right: keyboard.addKey(D),
      jump: keyboard.addKey(SPACE),
      dash: keyboard.addKey(SHIFT),
      attack: keyboard.addKey(J),
    };
  }

  // Textura temporal generada por código hasta que tengamos sprites reales
  private static createPlaceholderTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(TEXTURE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4fc3f7);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    g.fillStyle(0xffffff);
    g.fillRect(WIDTH - 9, 8, 5, 5); // "ojo" para ver hacia dónde mira
    g.generateTexture(TEXTURE_KEY, WIDTH, HEIGHT);
    g.destroy();
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.isDead) return;

    // Leer las pulsaciones una vez por frame, siempre: JustDown/JustUp se "consumen" al consultarlos,
    // así una pulsación hecha durante el dash no se dispara de golpe cuando termina
    const jumpPressed = Phaser.Input.Keyboard.JustDown(this.keys.jump);
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.keys.jump);
    const dashPressed = Phaser.Input.Keyboard.JustDown(this.keys.dash);
    const attackPressed = Phaser.Input.Keyboard.JustDown(this.keys.attack);

    this.updateGroundState();
    this.updateAttack(time);
    this.updateDamageFeedback(time);

    if (this.isDashing) {
      // Durante el dash el jugador no controla nada: el dash manda sobre el movimiento y el salto
      if (time >= this.dashEndTime) this.endDash();
      return;
    }

    if (dashPressed && this.canDash(time)) {
      this.startDash(time);
      return;
    }

    if (time >= this.horizontalInputLockedUntil) this.handleHorizontalMovement();
    this.updateWallSlide();
    this.handleJump(time, jumpPressed, jumpReleased);

    if (attackPressed && time >= this.nextAttackTime) this.startAttack(time);
  }

  // Zona de impacto actual en coordenadas del mundo, o null si no está atacando
  getAttackHitbox(): Phaser.Geom.Rectangle | null {
    if (!this.isAttacking) return null;

    const centerX = this.x + this.attackDirection * (WIDTH / 2 + ATTACK_WIDTH / 2);
    return new Phaser.Geom.Rectangle(
      centerX - ATTACK_WIDTH / 2,
      this.y - ATTACK_HEIGHT / 2,
      ATTACK_WIDTH,
      ATTACK_HEIGHT,
    );
  }

  // Devuelve true si el objetivo aún no había sido golpeado en este ataque (y lo marca como golpeado)
  registerHit(target: Phaser.GameObjects.GameObject): boolean {
    if (this.hitTargets.has(target)) return false;
    this.hitTargets.add(target);
    return true;
  }

  get health(): number {
    return this.currentHealth;
  }

  // fromX: posición X de quien hace daño, para empujar al jugador en sentido contrario
  takeDamage(amount: number, fromX: number): void {
    const time = this.scene.time.now;
    if (this.isDead || time < this.invulnerableUntil) return;

    this.currentHealth = Math.max(0, this.currentHealth - amount);
    this.emit(PlayerEvents.HEALTH_CHANGED, this.currentHealth, this.maxHealth);

    if (this.currentHealth === 0) {
      this.die();
      return;
    }

    this.emit(PlayerEvents.DAMAGED);

    // El golpe interrumpe dash y wall slide: el retroceso manda sobre cualquier otro movimiento
    if (this.isDashing) this.endDash();
    this.isWallSliding = false;

    const away = this.x >= fromX ? 1 : -1;
    this.setVelocity(away * KNOCKBACK_VELOCITY_X, KNOCKBACK_VELOCITY_Y);
    this.setTint(HURT_TINT);

    this.invulnerableUntil = time + INVULNERABLE_MS;
    this.hurtUntil = time + KNOCKBACK_LOCK_MS;
    this.horizontalInputLockedUntil = Math.max(this.horizontalInputLockedUntil, this.hurtUntil);
  }

  destroy(fromScene?: boolean): void {
    this.attackHitbox.destroy();
    super.destroy(fromScene);
  }

  private isOnGround(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  private updateGroundState(): void {
    if (this.isOnGround() && this.body.velocity.y >= 0) {
      // En el suelo (y no en el frame en que acaba de despegar): se recargan saltos y dash aéreo
      this.jumpsRemaining = MAX_JUMPS;
      this.hasAirDash = true;
    } else if (!this.isOnGround() && this.jumpsRemaining === MAX_JUMPS) {
      // Se cayó de un borde sin saltar: pierde el salto "de suelo" y solo le queda el del aire
      this.jumpsRemaining = MAX_JUMPS - 1;
    }
  }

  private handleHorizontalMovement(): void {
    const { left, right } = this.keys;

    if (left.isDown && !right.isDown) {
      this.setVelocityX(-MOVE_SPEED);
      this.setFlipX(true);
    } else if (right.isDown && !left.isDown) {
      this.setVelocityX(MOVE_SPEED);
      this.setFlipX(false);
    } else {
      this.setVelocityX(0);
    }
  }

  private getWallDirection(): -1 | 0 | 1 {
    if (this.isOnGround()) return 0;
    // blocked = bordes del mundo / tiles, touching = otros cuerpos (nuestras paredes estáticas)
    if (this.body.blocked.left || this.body.touching.left) return -1;
    if (this.body.blocked.right || this.body.touching.right) return 1;
    return 0;
  }

  private updateWallSlide(): void {
    this.wallDirection = this.getWallDirection();

    const pressingIntoWall =
      (this.wallDirection === -1 && this.keys.left.isDown) ||
      (this.wallDirection === 1 && this.keys.right.isDown);

    // Solo se desliza al caer: si aún sube pegado a la pared, el salto sigue su curso
    this.isWallSliding = pressingIntoWall && this.body.velocity.y > 0;
    if (!this.isWallSliding) return;

    this.setVelocityY(Math.min(this.body.velocity.y, WALL_SLIDE_MAX_FALL_SPEED));
    // Mira hacia fuera de la pared: así el dash y el ataque salen hacia el lado libre
    this.setFlipX(this.wallDirection === 1);
    // Agarrarse a una pared recarga el salto aéreo y el dash
    this.jumpsRemaining = MAX_JUMPS - 1;
    this.hasAirDash = true;
  }

  private handleJump(time: number, jumpPressed: boolean, jumpReleased: boolean): void {
    if (jumpPressed) {
      // El wall jump tiene prioridad sobre el doble salto cuando hay una pared al lado
      if (this.wallDirection !== 0) {
        this.wallJump(time, this.wallDirection);
      } else if (this.jumpsRemaining > 0) {
        const isGroundJump = this.jumpsRemaining === MAX_JUMPS;
        this.setVelocityY(isGroundJump ? JUMP_VELOCITY : DOUBLE_JUMP_VELOCITY);
        this.jumpsRemaining--;
        this.emit(PlayerEvents.JUMPED, isGroundJump ? 'ground' : 'air');
      }
    }

    // Salto variable: si sueltas la tecla mientras subes, el salto se corta
    if (jumpReleased && this.body.velocity.y < 0) {
      this.setVelocityY(this.body.velocity.y * JUMP_CUT_FACTOR);
    }
  }

  private wallJump(time: number, wallDirection: Direction): void {
    const away = -wallDirection;
    this.setVelocity(away * WALL_JUMP_VELOCITY_X, WALL_JUMP_VELOCITY_Y);
    this.setFlipX(away === -1);
    this.isWallSliding = false;
    this.horizontalInputLockedUntil = time + WALL_JUMP_INPUT_LOCK_MS;
    // Tras saltar de la pared aún queda el salto aéreo
    this.jumpsRemaining = MAX_JUMPS - 1;
    this.emit(PlayerEvents.JUMPED, 'wall');
  }

  private canDash(time: number): boolean {
    if (time < this.nextDashTime || time < this.hurtUntil) return false;
    return this.isOnGround() || this.hasAirDash;
  }

  private startDash(time: number): void {
    this.isDashing = true;
    this.isWallSliding = false;
    this.dashEndTime = time + DASH_DURATION_MS;
    this.nextDashTime = time + DASH_DURATION_MS + DASH_COOLDOWN_MS;
    if (!this.isOnGround()) this.hasAirDash = false;

    const direction = this.flipX ? -1 : 1;
    this.body.setAllowGravity(false);
    this.setVelocity(DASH_SPEED * direction, 0);
    this.setTint(DASH_TINT);
    this.emit(PlayerEvents.DASHED);
  }

  private endDash(): void {
    this.isDashing = false;
    this.body.setAllowGravity(true);
    // Sin inercia del dash: el jugador recupera el control limpio y empieza a caer desde 0
    this.setVelocity(0, 0);
    this.clearTint();
  }

  private startAttack(time: number): void {
    this.isAttacking = true;
    this.attackEndTime = time + ATTACK_DURATION_MS;
    this.nextAttackTime = time + ATTACK_COOLDOWN_MS;
    // La dirección se fija al empezar: girarse a mitad del golpe no mueve la zona de impacto
    this.attackDirection = this.flipX ? -1 : 1;
    this.hitTargets.clear();
    this.attackHitbox.setVisible(true);
    this.updateAttack(time);
    this.emit(PlayerEvents.ATTACKED);
  }

  private updateAttack(time: number): void {
    if (!this.isAttacking) return;

    if (time >= this.attackEndTime) {
      this.isAttacking = false;
      this.attackHitbox.setVisible(false);
      return;
    }

    // La zona de impacto acompaña al jugador mientras dura el ataque
    const hitbox = this.getAttackHitbox()!;
    this.attackHitbox.setPosition(hitbox.centerX, hitbox.centerY);
  }

  private updateDamageFeedback(time: number): void {
    // Parpadeo mientras dura la invulnerabilidad
    if (time < this.invulnerableUntil) {
      this.setAlpha(Math.floor(time / BLINK_INTERVAL_MS) % 2 === 0 ? 0.3 : 1);
    } else {
      this.setAlpha(1);
    }

    if (this.hurtUntil !== 0 && time >= this.hurtUntil) {
      this.hurtUntil = 0;
      this.clearTint();
    }
  }

  private die(): void {
    this.isDead = true;
    if (this.isDashing) this.endDash();
    this.isAttacking = false;
    this.attackHitbox.setVisible(false);
    this.setVelocityX(0);
    this.setAlpha(1);
    this.setTint(HURT_TINT);
    this.emit(PlayerEvents.DIED);
  }
}
