import Phaser from 'phaser';
import { TILEMAP, TILESET, SFX, type SfxKey } from '../config/assets';
import { Player, PlayerEvents, type JumpKind } from '../entities/Player';
import type { Enemy } from '../entities/Enemy';
import { Dummy } from '../entities/Dummy';
import { Shooter, ShooterEvents } from '../entities/Shooter';
import { Projectile, ProjectilePool } from '../entities/Projectile';
import { HealthHud } from '../ui/HealthHud';
import { SoundFx } from '../audio/SoundFx';

// Nombres de las capas tal y como están en Tiled
const GROUND_LAYER = 'ground';
const ENTITIES_LAYER = 'entities';

const DEATH_FADE_MS = 800;
const HUD_MARGIN = 16;

// Suavizado de la cámara: 1 = pegada al jugador, valores bajos = más suave (0.1 ≈ alcanza el 10% de la distancia por frame)
const CAMERA_LERP = 0.1;

// Tono de cada tipo de salto (en cents) para distinguirlos de oído con un solo sonido
const JUMP_DETUNE: Record<JumpKind, number> = { ground: 0, wall: 150, air: 300 };

// Lee una propiedad personalizada de un objeto de Tiled (Phaser las deja como array [{ name, value }])
function getTiledProperty<T>(object: Phaser.Types.Tilemaps.TiledObject, name: string): T | undefined {
  const properties = object.properties as { name: string; value: unknown }[] | undefined;
  return properties?.find((property) => property.name === name)?.value as T | undefined;
}

export class MainScene extends Phaser.Scene {
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private player!: Player;
  private enemies: Enemy[] = [];
  private projectiles!: ProjectilePool;
  private healthHud!: HealthHud;
  private sfx!: SoundFx;

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    // scene.restart() vuelve a llamar a create() sobre la MISMA instancia de la escena:
    // hay que reiniciar a mano el estado que no se crea aquí, o se acumularían los enemigos destruidos
    this.enemies = [];
    this.cameras.main.fadeIn(DEATH_FADE_MS / 2);

    this.sfx = new SoundFx(this);

    const map = this.createMap();
    this.projectiles = new ProjectilePool(this);
    this.spawnEntities(map);

    this.setupCollisions();
    this.setupPlayerEvents();
    this.setupCamera(map);
    this.createHud();
  }

  update(): void {
    this.resolvePlayerAttack();
  }

  private createMap(): Phaser.Tilemaps.Tilemap {
    const map = this.make.tilemap({ key: TILEMAP.key });

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
    return map;
  }

  // Crea jugador y enemigos a partir de los objetos de la capa "entities" de Tiled
  private spawnEntities(map: Phaser.Tilemaps.Tilemap): void {
    const objects = map.getObjectLayer(ENTITIES_LAYER)?.objects ?? [];

    // El jugador va primero: los enemigos que lo persiguen o le disparan necesitan una referencia a él
    const playerSpawn = objects.find((object) => object.type === 'player');
    if (!playerSpawn) throw new Error('El mapa no tiene ningún objeto de tipo "player"');
    this.player = new Player(this, playerSpawn.x ?? 0, playerSpawn.y ?? 0);

    for (const object of objects) {
      const x = object.x ?? 0;
      const y = object.y ?? 0;

      switch (object.type) {
        case 'player':
          break;
        case 'dummy':
          this.enemies.push(new Dummy(this, x, y, { patrolRange: getTiledProperty<number>(object, 'patrolRange') }));
          break;
        case 'shooter':
          this.enemies.push(this.createShooter(x, y));
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

  private setupCollisions(): void {
    this.physics.add.collider(this.player, this.groundLayer);
    this.physics.add.collider(this.enemies, this.groundLayer);

    // Los proyectiles desaparecen al chocar con el escenario
    this.physics.add.collider(this.projectiles, this.groundLayer, (projectile) => {
      (projectile as Projectile).deactivate();
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

  // Todo el audio del jugador sale de sus eventos: el Player no sabe que existe un sistema de sonido
  private setupPlayerEvents(): void {
    const playAtPlayer = (key: SfxKey, detune = 0) => this.sfx.play(key, { x: this.player.x, detune });

    this.player.on(PlayerEvents.HEALTH_CHANGED, (health: number) => this.healthHud.setHealth(health));
    this.player.on(PlayerEvents.JUMPED, (kind: JumpKind) => playAtPlayer(SFX.JUMP, JUMP_DETUNE[kind]));
    this.player.on(PlayerEvents.DASHED, () => playAtPlayer(SFX.DASH));
    this.player.on(PlayerEvents.ATTACKED, () => playAtPlayer(SFX.ATTACK));
    this.player.on(PlayerEvents.DAMAGED, () => playAtPlayer(SFX.HURT));
    this.player.once(PlayerEvents.DIED, () => {
      playAtPlayer(SFX.DEATH);
      this.handlePlayerDeath();
    });
  }

  private handlePlayerDeath(): void {
    // Fundido a negro y se reinicia el nivel (jugador, enemigos y vida vuelven al estado inicial)
    this.cameras.main.fadeOut(DEATH_FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.restart());
  }

  // Comprueba si la zona de impacto del jugador toca a algún enemigo
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
    }
  }

  private setupCamera(map: Phaser.Tilemaps.Tilemap): void {
    const camera = this.cameras.main;
    // La cámara no muestra nada fuera del mapa: se detiene en sus bordes
    camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    // roundPixels = true evita el "temblor" de sprites pixel art con posiciones decimales
    camera.startFollow(this.player, true, CAMERA_LERP, CAMERA_LERP);
  }

  private createHud(): void {
    this.healthHud = new HealthHud(this, HUD_MARGIN, HUD_MARGIN, this.player.maxHealth);

    this.add
      .text(HUD_MARGIN, HUD_MARGIN + 30, 'A D moverse   ESPACIO saltar   SHIFT dash   J atacar\nSalta contra una pared y mantén la dirección para deslizarte', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setScrollFactor(0); // fijo en pantalla: no se mueve con la cámara (HUD)
  }
}
