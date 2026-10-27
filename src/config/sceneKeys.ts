// Claves de escena en un solo sitio: las escenas se lanzan entre sí por clave
// y así se evitan imports circulares entre ellas
export const SCENES = {
  PRELOAD: 'PreloadScene',
  MAIN_MENU: 'MainMenuScene',
  GAME: 'MainScene',
  PAUSE: 'PauseScene',
} as const;
