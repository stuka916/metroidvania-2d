import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/constants';
import { TILESET, SFX, isMapKey, type MapKey, type SfxKey } from '../config/assets';
import { SCENES } from '../config/sceneKeys';
import { Player, PlayerEvents, type JumpKind } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { Dummy } from '../entities/Dummy';
import { Shooter, ShooterEvents } from '../entities/Shooter';
import { Projectile, ProjectilePool } from '../entities/Projectile';
import { Lever } from '../world/Lever';
import { Gate } from '../world/Gate';
import { Door } from '../world/Door';
import { HealthHud } from '../ui/HealthHud';
import { SoundFx } from '../audio/SoundFx';
import { Effects } from '../effects/Effects';
import { hasWorldFlag, setWorldFlag } from '../state/worldState';

// Qué zona cargar y dónde aparecer. Se pasa al arrancar/reiniciar la escena: scene.start(SCENES.GAME, data)
export interface LevelData {
  map: MapKey;
  // Nombre del objeto "spawn" de Tiled donde aparece el jugador
  spawn: string;
  // Vida con la que entra (al cruzar una puerta se conserva); sin valor = vida completa
  health?: number;
}

// Nombres de las capas tal y como están en Tiled
const GROUND_LAYER = 'ground';
const ENTITIES_LAYER = 'entities';

const DEFAULT_BACKGROUND = '#1d1d2b';
const ZONE_FADE_MS = 300;
const DEATH_FADE_MS = 800;
const HUD_MARGIN = 16;
const HUD_DEPTH = 100;
// Retraso entre golpear la palanca y que se abra la barrera (da tiempo a que se vea la palanca cambiar)
const GATE_OPEN_DELAY_MS = 250;
const WALL_DUST_INTERVAL_MS = 70;
const PLAYER_COLOR = 0x4fc3f7;

// Suavizado de la cámara: 1 = pegada al jugador, valores bajos = más suave (0.1 ≈ alcanza el 10% de la distancia por frame)
const CAMERA_LERP = 0.1;

// Tono de cada tipo de salto (en cents) para distinguirlos de oído con un solo sonido
const JUMP_DETUNE: Record<JumpKind, number> = { ground: 0, wall: 150, air: 300 };

// Lee una propiedad personalizada de Tiled (de un objeto o del mapa). Phaser las deja como array [{ name, value }]
function getTiledProperty<T>(source: { properties?: unknown }, name: string): T | undefined {
  const properties = source.properties as { name: string; value: unknown }[] | undefined;
  if (!Array.isArray(properties)) return undefined;
  return properties.find((property) => property.name === name)?.value as T | undefined;
}

export class MainScene extends Phaser.Scene {
  private level!: LevelData;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private player!: Player;
  private enemies: Enemy[] = [];
  private levers: Lever[] = [];
  private gates: Gate[] = [];
  private doors: Door[] = [];
  private projectiles!: ProjectilePool;
  private healthHud!: HealthHud;
  private sfx!: SoundFx;
  private effects!: Effects;

  private pauseKeys!: Phaser.Input.Keyboard.Key[];
  private interactKey!: Phaser.Input.Keyboard.Key;
  // Durante un fundido (muerte o cambio de zona) se ignoran la pausa y las puertas
  private isTransitioning = false;
  private nextWallDustTime = 0;

  constructor() {
    super({ key: SCENES.GAME });
  }

  // init se ejecuta antes de create() y recibe los datos de scene.start / scene.restart
  init(data: Partial<LevelData>): void {
    this.level = { map: data.map ?? 'level1', spawn: data.spawn ?? 'start', health: data.health };
  }

  create(): void {
    // scene.restart() vuelve a llamar a create() sobre la MISMA instancia de la escena:
    // hay que reiniciar a mano el estado que no se crea aquí, o se acumularían objetos destruidos
    this.enemies = [];
    this.levers = [];
    this.gates = [];
    this.doors = [];
    this.isTransitioning = false;
    this.nextWallDustTime = 0;

    this.cameras.main.fadeIn(ZONE_FADE_MS);

    this.sfx = new SoundFx(this);
    this.effects = new Effects(this);

    const map = this.createMap();
    this.projectiles = new ProjectilePool(this);
    this.spawnEntities(map);

    this.setupCollisions();
    this.setupPlayerEvents();
    this.setupInput();
    this.setupCamera(map);
    this.createHud(map);
  }

  update(time: number): void {
    if (this.isTransitioning) return;

    if (this.pauseKeys.some((key) => Phaser.Input.Keyboard.JustDown(key))) {
      this.openPause();
      return;
    }

    this.resolvePlayerAttack();
    this.updateDoors();
    this.updateWallDust(time);
  }

  // ───────────────────────────── Mapa y entidades ─────────────────────────────

  private createMap(): Phaser.Tilemaps.Tilemap {
    const map = this.make.tilemap({ key: this.level.map });

    // Une el tileset definido en Tiled (por su nombre) con la textura cargada en PreloadScene
    const tileset = map.addTilesetImage(TILESET.tiledName, TILESET.key);
    if (!tileset) throw new Error(`Tileset "${TILESET.tiledName}" no encontrado en el mapa`);

    const groundLayer = map.createLayer(GROUND_LAYER, tileset, 0, 0);
    if (!groundLayer) throw new Error(`Capa "${GROUND_LAYER}" no encontrada en el mapa`);

    // Colisionan las baldosas que en Tiled tienen la propiedad personalizada collides = true
    groundLayer.setCollisionByProperty({ collides: true });
    this.groundLayer = groundLayer;

    // El tamaño del mundo lo marca el mapa
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setBackgroundColor(getTiledProperty<string>(map, 'backgroundColor') ?? DEFAULT_BACKGROUND);
    return map;
  }

  // Crea jugador, enemigos y objetos del nivel a partir de la capa "entities" de Tiled
  private spawnEntities(map: Phaser.Tilemaps.Tilemap): void {
    const objects = map.getObjectLayer(ENTITIES_LAYER)?.objects ?? [];

    // El jugador va primero: los enemigos que le disparan necesitan una referencia a él
    const spawns = objects.filter((object) => object.type === 'spawn');
    const spawn =
      spawns.find((object) => object.name === this.level.spawn) ?? spawns.find((object) => object.name === 'start') ?? spawns[0];
    if (!spawn) throw new Error(`El mapa "${this.level.map}" no tiene ningún objeto de tipo "spawn"`);
    this.player = new Player(this, spawn.x ?? 0, spawn.y ?? 0, this.level.health);

    for (const object of objects) {
      const x = object.x ?? 0;
      const y = object.y ?? 0;

      switch (object.type) {
        case 'spawn':
          break;
        case 'dummy':
          this.enemies.push(new Dummy(this, x, y, { patrolRange: getTiledProperty<number>(object, 'patrolRange') }));
          break;
        case 'shooter':
          this.enemies.push(this.createShooter(x, y));
          break;
        case 'lever':
          this.createLever(object);
          break;
        case 'gate':
          this.createGate(object);
          break;
        case 'door':
          this.createDoor(object);
          break;
        default:
          console.warn(`Tipo de objeto desconocido en Tiled: "${object.type}" (${object.name})`);
      }
    }
  }

  private createShooter(x: number, y: number): Shooter {
    const shooter = new Shooter(this, x, y, { target: this.player });
    shooter.on(ShooterEvents.FIRE, (fireX: number, fireY: number, velocityX: number, velocityY: number) => {
      this.projectiles.fire(fireX, fireY, velocityX, velocityY);
      this.sfx.play(SFX.SHOOT, { x: fireX, volume: 0.7 });
    });
    return shooter;
  }

  // Flag del estado del mundo para una barrera de esta zona (los nombres solo son únicos dentro de un mapa)
  private gateFlag(gateName: string): string {
    return `gate-open:${this.level.map}:${gateName}`;
  }

  private createLever(object: Phaser.Types.Tilemaps.TiledObject): void {
    const target = getTiledProperty<string>(object, 'target');
    if (!target) {
      console.warn(`La palanca "${object.name}" no tiene la propiedad "target"`);
      return;
    }
    const activated = hasWorldFlag(this.registry, this.gateFlag(target));
    this.levers.push(new Lever(this, object.x ?? 0, object.y ?? 0, target, activated));
  }

  // Los rectángulos de Tiled tienen (x, y) en la esquina superior izquierda; las clases esperan el centro
  private createGate(object: Phaser.Types.Tilemaps.TiledObject): void {
    const width = object.width ?? 32;
    const height = object.height ?? 32;
    const gate = new Gate(this, (object.x ?? 0) + width / 2, (object.y ?? 0) + height / 2, width, height);
    gate.setName(object.name);

    // Si se abrió en una visita anterior a esta zona, aparece ya abierta
    if (hasWorldFlag(this.registry, this.gateFlag(object.name))) gate.open(false);
    this.gates.push(gate);
  }

  private createDoor(object: Phaser.Types.Tilemaps.TiledObject): void {
    const targetMap = getTiledProperty<string>(object, 'targetMap');
    const targetSpawn = getTiledProperty<string>(object, 'targetSpawn');
    if (!targetMap || !isMapKey(targetMap) || !targetSpawn) {
      console.warn(`La puerta "${object.name}" tiene un destino no válido: ${targetMap} / ${targetSpawn}`);
      return;
    }

    const width = object.width ?? 40;
    const height = object.height ?? 64;
    this.doors.push(new Door(this, (object.x ?? 0) + width / 2, (object.y ?? 0) + height / 2, targetMap, targetSpawn));
  }

  // ───────────────────────────── Colisiones y eventos ─────────────────────────────

  private setupCollisions(): void {
    // Las barreras cerradas bloquean igual que el escenario
    this.physics.add.collider(this.player, [this.groundLayer, ...this.gates]);
    this.physics.add.collider(this.enemies, [this.groundLayer, ...this.gates]);

    // Los proyectiles desaparecen (con unas chispas) al chocar con el escenario
    this.physics.add.collider(this.projectiles, [this.groundLayer, ...this.gates], (projectile) => {
      const shot = projectile as Projectile;
      this.effects.sparks(shot.x, shot.y, 4);
      shot.deactivate();
    });

    // overlap (no collider): detecta el contacto sin que los cuerpos se empujen entre sí
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      const target = enemy as Enemy;
      // takeDamage ignora el golpe si el jugador está en sus iframes, así que puede llamarse cada frame
      if (target.isAlive) this.player.takeDamage(target.contactDamage, target.x);
    });

    this.physics.add.overlap(this.player, this.projectiles, (_player, projectile) => {
      const shot = projectile as Projectile;
      shot.deactivate();
      this.player.takeDamage(shot.damage, shot.x);
    });
  }

  // Sonido y partículas del jugador salen de sus eventos: el Player no sabe que existen
  private setupPlayerEvents(): void {
    const player = this.player;
    const playAtPlayer = (key: SfxKey, detune = 0) => this.sfx.play(key, { x: player.x, detune });
    const feetY = () => player.y + player.displayHeight / 2;
    const facing = () => (player.flipX ? -1 : 1);

    player.on(PlayerEvents.HEALTH_CHANGED, (health: number) => this.healthHud.setHealth(health));

    player.on(PlayerEvents.JUMPED, (kind: JumpKind) => {
      playAtPlayer(SFX.JUMP, JUMP_DETUNE[kind]);
      if (kind === 'wall') {
        // Tras el wall jump mira hacia fuera, así que la pared queda a su espalda
        this.effects.dust(player.x - facing() * 12, player.y + 8, 6);
      } else {
        this.effects.dust(player.x, feetY(), kind === 'ground' ? 6 : 4);
      }
    });

    player.on(PlayerEvents.LANDED, () => this.effects.dust(player.x, feetY(), 8));

    player.on(PlayerEvents.DASHED, () => {
      playAtPlayer(SFX.DASH);
      // El polvo sale por detrás, en el punto de partida del dash
      this.effects.dust(player.x - facing() * 10, feetY() - 4, 10);
    });

    player.on(PlayerEvents.ATTACKED, () => playAtPlayer(SFX.ATTACK));

    player.on(PlayerEvents.DAMAGED, () => {
      playAtPlayer(SFX.HURT);
      this.effects.sparks(player.x, player.y, 8);
      this.cameras.main.shake(120, 0.006);
    });

    player.once(PlayerEvents.DIED, () => {
      playAtPlayer(SFX.DEATH);
      this.effects.burst(player.x, player.y, PLAYER_COLOR, 32);
      this.handlePlayerDeath();
    });
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard!;
    const { ESC, P, W } = Phaser.Input.Keyboard.KeyCodes;
    this.pauseKeys = [keyboard.addKey(ESC), keyboard.addKey(P)];
    this.interactKey = keyboard.addKey(W);
  }

  // ───────────────────────────── Lógica por frame ─────────────────────────────

  // Comprueba si la zona de impacto del jugador toca a algún enemigo o palanca
  private resolvePlayerAttack(): void {
    const hitbox = this.player.getAttackHitbox();
    if (!hitbox) return;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(hitbox, enemy.getBounds())) continue;
      // registerHit evita que un mismo golpe haga daño en varios frames seguidos
      if (!this.player.registerHit(enemy)) continue;

      enemy.takeDamage(this.player.attackDamage, this.player.x);
      this.sfx.play(SFX.HIT, { x: enemy.x });
      // Chispas en el punto de contacto, entre el centro del golpe y el del enemigo
      this.effects.sparks((hitbox.centerX + enemy.x) / 2, enemy.y);

      if (!enemy.isAlive) {
        this.effects.burst(enemy.x, enemy.y, enemy.particleColor);
        this.cameras.main.shake(100, 0.004);
      }
    }

    for (const lever of this.levers) {
      if (!lever.isActivated && Phaser.Geom.Intersects.RectangleToRectangle(hitbox, lever.getBounds())) {
        this.activateLever(lever);
      }
    }
  }

  private activateLever(lever: Lever): void {
    if (!lever.activate()) return;

    this.sfx.play(SFX.SWITCH, { x: lever.x });
    this.effects.sparks(lever.x, lever.y, 8);
    // Se guarda en el estado del mundo: la barrera seguirá abierta al volver a esta zona
    setWorldFlag(this.registry, this.gateFlag(lever.target));

    const targets = this.gates.filter((gate) => gate.name === lever.target);
    if (targets.length === 0) console.warn(`La palanca apunta a "${lever.target}", que no existe en este mapa`);

    this.time.delayedCall(GATE_OPEN_DELAY_MS, () => {
      for (const gate of targets) {
        gate.open();
        this.sfx.play(SFX.GATE, { x: gate.x });
        this.cameras.main.shake(400, 0.004);
      }
    });
  }

  private updateDoors(): void {
    // Se lee siempre, aunque no haya puerta: si no, una W pulsada lejos de la puerta
    // quedaría "pendiente" y se dispararía al llegar a ella
    const interactPressed = Phaser.Input.Keyboard.JustDown(this.interactKey);
    const playerBounds = this.player.getBounds();

    for (const door of this.doors) {
      const inFront = Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, door.getBounds());
      door.setPromptVisible(inFront);
      if (inFront && interactPressed) {
        this.enterDoor(door);
        return;
      }
    }
  }

  // Polvo continuo mientras se desliza por una pared (a intervalos para no saturar)
  private updateWallDust(time: number): void {
    const side = this.player.wallSlideDirection;
    if (side === 0 || time < this.nextWallDustTime) return;

    this.effects.dust(this.player.x + side * 12, this.player.y + 8, 2);
    this.nextWallDustTime = time + WALL_DUST_INTERVAL_MS;
  }

  // ───────────────────────────── Transiciones ─────────────────────────────

  private openPause(): void {
    // launch arranca PauseScene en paralelo (encima); pause congela esta escena: física, update y temporizadores
    this.scene.launch(SCENES.PAUSE, this.level);
    this.scene.pause();
  }

  private enterDoor(door: Door): void {
    this.isTransitioning = true;
    door.setPromptVisible(false);
    // Jugador congelado durante el fundido: sin control y sin recibir daño
    this.player.setVelocity(0, 0).setActive(false);
    this.sfx.play(SFX.DOOR, { x: door.x });

    const next: LevelData = { map: door.targetMap, spawn: door.targetSpawn, health: this.player.health };
    this.cameras.main.fadeOut(ZONE_FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(next));
  }

  private handlePlayerDeath(): void {
    this.isTransitioning = true;
    // Reaparece en la entrada de la zona actual con la vida completa
    const retry: LevelData = { map: this.level.map, spawn: this.level.spawn };
    this.cameras.main.fadeOut(DEATH_FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart(retry));
  }

  // ───────────────────────────── Cámara y HUD ─────────────────────────────

  private setupCamera(map: Phaser.Tilemaps.Tilemap): void {
    const camera = this.cameras.main;
    // La cámara no muestra nada fuera del mapa: se detiene en sus bordes
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // roundPixels = true evita el "temblor" de sprites pixel art con posiciones decimales
    camera.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
  }

  private createHud(map: Phaser.Tilemaps.Tilemap): void {
    this.healthHud = new HealthHud(this, HUD_MARGIN, HUD_MARGIN, this.player.maxHealth);
    this.healthHud.setHealth(this.player.health);

    this.add
      .text(GAME_WIDTH - HUD_MARGIN, HUD_MARGIN, 'ESC · pausa', { fontFamily: 'monospace', fontSize: '14px', color: '#9e9eb8' })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);

    const zoneName = getTiledProperty<string>(map, 'zoneName');
    if (zoneName) this.showZoneName(zoneName);
  }

  // Cartel con el nombre de la zona que aparece y se desvanece al entrar
  private showZoneName(name: string): void {
    const banner = this.add
      .text(GAME_WIDTH / 2, 110, name, { fontFamily: 'monospace', fontSize: '26px', color: '#ffffff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setAlpha(0);

    this.tweens.add({
      targets: banner,
      alpha: 1,
      duration: 400,
      hold: 1400,
      yoyo: true,
      onComplete: () => banner.destroy(),
    });
  }
}
