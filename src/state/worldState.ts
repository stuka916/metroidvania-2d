import Phaser from 'phaser';

// Estado del mundo que debe sobrevivir a los cambios de zona y a las muertes (palancas activadas,
// barreras abiertas...). Se guarda en el registry de Phaser, que es global al juego y no se borra
// al reiniciar o cambiar de escena

const FLAGS_KEY = 'world-flags';

function getFlags(registry: Phaser.Data.DataManager): string[] {
  return (registry.get(FLAGS_KEY) as string[] | undefined) ?? [];
}

export function resetWorldFlags(registry: Phaser.Data.DataManager): void {
  registry.set(FLAGS_KEY, []);
}

export function hasWorldFlag(registry: Phaser.Data.DataManager, flag: string): boolean {
  return getFlags(registry).includes(flag);
}

export function setWorldFlag(registry: Phaser.Data.DataManager, flag: string): void {
  const flags = getFlags(registry);
  if (!flags.includes(flag)) registry.set(FLAGS_KEY, [...flags, flag]);
}
