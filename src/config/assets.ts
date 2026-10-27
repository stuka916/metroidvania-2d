// Claves y rutas de los recursos: se cargan en PreloadScene y se usan por clave en el resto del juego

export const TILEMAP = { key: 'level1', url: 'assets/tilemaps/level1.json' } as const;

// tiledName = nombre del tileset dentro del mapa de Tiled; key = clave de la textura en Phaser
export const TILESET = { key: 'tileset', url: 'assets/images/tileset.png', tiledName: 'tileset' } as const;

export const SFX = {
  JUMP: 'sfx-jump',
  DASH: 'sfx-dash',
  ATTACK: 'sfx-attack',
  HURT: 'sfx-hurt',
  DEATH: 'sfx-death',
  SHOOT: 'sfx-shoot',
  HIT: 'sfx-hit',
} as const;

export type SfxKey = (typeof SFX)[keyof typeof SFX];

export const SFX_FILES: Record<SfxKey, string> = {
  [SFX.JUMP]: 'assets/audio/jump.wav',
  [SFX.DASH]: 'assets/audio/dash.wav',
  [SFX.ATTACK]: 'assets/audio/attack.wav',
  [SFX.HURT]: 'assets/audio/hurt.wav',
  [SFX.DEATH]: 'assets/audio/death.wav',
  [SFX.SHOOT]: 'assets/audio/shoot.wav',
  [SFX.HIT]: 'assets/audio/hit.wav',
};
