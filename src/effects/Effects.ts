import Phaser from 'phaser';

const PARTICLE_KEY = 'particle';
const PARTICLE_SIZE = 4;
// Por encima del escenario y las entidades
const PARTICLE_DEPTH = 10;

const DUST_TINTS = [0xd7ccc8, 0xbcaaa4, 0x8d6e63];
const SPARK_TINTS = [0xffffff, 0xffeb3b, 0xffb74d];

// Efectos de partículas del nivel. Cada emisor se crea una vez con emitting: false
// y se usa con explode(), que lanza N partículas de golpe en una posición
export class Effects {
  private dustEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparksEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private burstEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    Effects.createParticleTexture(scene);

    // Polvo: sube un poco y se desvanece despacio
    this.dustEmitter = scene.add.particles(0, 0, PARTICLE_KEY, {
      lifespan: { min: 250, max: 450 },
      speed: { min: 20, max: 70 },
      angle: { min: 200, max: 340 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: DUST_TINTS,
      gravityY: -30,
      emitting: false,
    });

    // Chispas de impacto: rápidas, en todas direcciones y con mezcla aditiva para que "brillen"
    this.sparksEmitter = scene.add.particles(0, 0, PARTICLE_KEY, {
      lifespan: { min: 150, max: 300 },
      speed: { min: 120, max: 280 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      tint: SPARK_TINTS,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });

    // Estallido al destruir un enemigo: trozos de su color que caen con gravedad
    this.burstEmitter = scene.add.particles(0, 0, PARTICLE_KEY, {
      lifespan: { min: 400, max: 700 },
      speed: { min: 80, max: 260 },
      angle: { min: 200, max: 340 },
      scale: { start: 1.6, end: 0 },
      gravityY: 600,
      emitting: false,
    });

    for (const emitter of [this.dustEmitter, this.sparksEmitter, this.burstEmitter]) emitter.setDepth(PARTICLE_DEPTH);
  }

  private static createParticleTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(PARTICLE_KEY)) return;

    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, PARTICLE_SIZE, PARTICLE_SIZE);
    g.generateTexture(PARTICLE_KEY, PARTICLE_SIZE, PARTICLE_SIZE);
    g.destroy();
  }

  dust(x: number, y: number, count = 6): void {
    this.dustEmitter.explode(count, x, y);
  }

  sparks(x: number, y: number, count = 10): void {
    this.sparksEmitter.explode(count, x, y);
  }

  // color: el del enemigo destruido, para que parezca que se rompe en pedazos
  burst(x: number, y: number, color: number, count = 24): void {
    this.burstEmitter.setParticleTint(color);
    this.burstEmitter.explode(count, x, y);
  }
}
