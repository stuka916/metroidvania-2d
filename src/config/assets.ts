// Claves y rutas de los recursos: se cargan en PreloadScene y se usan por clave en el resto del juego

// Cada mapa se guarda en la caché de Phaser con su nombre como clave (el mismo que usan las puertas de Tiled)
export const MAPS = {
  level1: 'assets/tilemaps/level1.json',
  level2: 'assets/tilemaps/level2.json',
} as const;

export type MapKey = keyof typeof MAPS;

export function isMapKey(value: string): value is MapKey {
  return value in MAPS;
}

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
  SWITCH: 'sfx-switch',
  GATE: 'sfx-gate',
  DOOR: 'sfx-door',
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
  [SFX.SWITCH]: 'assets/audio/switch.wav',
  [SFX.GATE]: 'assets/audio/gate.wav',
  [SFX.DOOR]: 'assets/audio/door.wav',
};
