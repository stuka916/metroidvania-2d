// Genera recursos provisionales para el prototipo (sin dependencias, solo Node):
//   - public/assets/images/tileset.png     → 4 baldosas de 32x32
//   - public/assets/tilemaps/level1.json   → mapa en formato Tiled JSON (ábrelo y edítalo con Tiled)
//   - public/assets/audio/*.wav            → efectos de sonido estéreo sintetizados
//
// Uso: npm run assets:generate            (no sobrescribe el mapa si ya existe)
//      npm run assets:generate -- --force (regenera también el mapa)

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'public', 'assets');
const FORCE = process.argv.includes('--force');

function write(relativePath, data) {
  const fullPath = join(ASSETS, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, data);
  console.log('  ✓', relativePath);
}

// Generador pseudoaleatorio con semilla: los recursos salen idénticos en cada ejecución
function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

// ───────────────────────────── Tileset (PNG) ─────────────────────────────

const TILE = 32;
// Índices de baldosa (gid en Tiled: índice + 1)
const T = { GRASS: 1, DIRT: 2, WOOD: 3, STONE: 4 };

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  // Cada fila empieza con un byte de filtro (0 = sin filtro)
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function generateTileset() {
  const count = Object.keys(T).length;
  const width = TILE * count;
  const pixels = Buffer.alloc(width * TILE * 4);
  const random = seededRandom(42);

  const setPixel = (x, y, [r, g, b]) => {
    const i = (y * width + x) * 4;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
  };
  const shade = ([r, g, b], amount) => [r, g, b].map((c) => Math.max(0, Math.min(255, c + amount)));

  const painters = {
    [T.GRASS]: (x, y) => {
      if (y < 6) return shade([76, 175, 80], y === 0 ? 30 : 0);
      if (y < 8 && random() < 0.4) return [56, 142, 60];
      return shade([109, 76, 65], random() < 0.12 ? -20 : 0);
    },
    [T.DIRT]: () => shade([93, 64, 55], random() < 0.15 ? -18 : 0),
    [T.WOOD]: (x, y) => {
      if (y === 0 || y === TILE - 1 || x === 0 || x === TILE - 1) return [78, 52, 46];
      if (y % 8 === 0) return [109, 76, 65];
      return shade([141, 110, 99], random() < 0.08 ? -12 : 0);
    },
    [T.STONE]: (x, y) => {
      const row = Math.floor(y / 8);
      const offset = row % 2 === 0 ? 0 : 8;
      if (y % 8 === 0 || (x + offset) % 16 === 0) return [69, 90, 100];
      return shade([96, 125, 139], random() < 0.1 ? -14 : 0);
    },
  };

  for (const [index, paint] of Object.entries(painters)) {
    const originX = (Number(index) - 1) * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) setPixel(originX + x, y, paint(x, y));
    }
  }

  write('images/tileset.png', encodePng(width, TILE, pixels));
  return { width, count };
}

// ───────────────────────────── Mapa (Tiled JSON) ─────────────────────────────

const MAP_WIDTH = 50;
const MAP_HEIGHT = 20;

function generateMap(tileset) {
  const data = new Array(MAP_WIDTH * MAP_HEIGHT).fill(0);
  const fill = (x1, x2, y1, y2, tile) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) data[y * MAP_WIDTH + x] = tile;
  };

  fill(0, MAP_WIDTH - 1, 18, 18, T.GRASS); // suelo
  fill(0, MAP_WIDTH - 1, 19, 19, T.DIRT);
  fill(12, 17, 15, 15, T.WOOD); // plataforma A
  fill(24, 28, 11, 11, T.WOOD); // plataforma B
  fill(31, 32, 6, 17, T.STONE); // pilar para wall slide / wall jump
  fill(36, 42, 13, 13, T.WOOD); // plataforma C (patrulla)
  fill(44, 48, 9, 9, T.WOOD); // plataforma D

  // Punto (x, y) sobre la superficie de la fila `tileRow` para una entidad de altura `height`
  const standOn = (pixelX, tileRow, height) => ({ x: pixelX, y: tileRow * TILE - height / 2 });

  const spawns = [
    { name: 'player', type: 'player', ...standOn(112, 18, 40) },
    { name: 'dummy-floor', type: 'dummy', ...standOn(320, 18, 36) },
    {
      name: 'dummy-patrol',
      type: 'dummy',
      ...standOn(39.5 * TILE, 13, 36),
      properties: [{ name: 'patrolRange', type: 'float', value: 80 }],
    },
    { name: 'shooter-pillar', type: 'shooter', ...standOn(32 * TILE, 6, 32) },
  ];

  const objects = spawns.map((spawn, i) => ({
    id: i + 1,
    name: spawn.name,
    type: spawn.type,
    x: spawn.x,
    y: spawn.y,
    width: 0,
    height: 0,
    point: true,
    rotation: 0,
    visible: true,
    ...(spawn.properties ? { properties: spawn.properties } : {}),
  }));

  const map = {
    compressionlevel: -1,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    version: '1.10',
    type: 'map',
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 3,
    nextobjectid: objects.length + 1,
    layers: [
      {
        id: 1,
        name: 'ground',
        type: 'tilelayer',
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        data,
      },
      {
        id: 2,
        name: 'entities',
        type: 'objectgroup',
        draworder: 'topdown',
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        objects,
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'tileset',
        image: '../images/tileset.png',
        imagewidth: tileset.width,
        imageheight: TILE,
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: tileset.count,
        columns: tileset.count,
        margin: 0,
        spacing: 0,
        // Propiedad personalizada de Tiled: el juego hace colisionables las baldosas con collides = true
        tiles: Array.from({ length: tileset.count }, (_, id) => ({
          id,
          properties: [{ name: 'collides', type: 'bool', value: true }],
        })),
      },
    ],
  };

  const mapPath = 'tilemaps/level1.json';
  if (existsSync(join(ASSETS, mapPath)) && !FORCE) {
    console.log('  – tilemaps/level1.json ya existe (usa --force para regenerarlo)');
    return;
  }
  write(mapPath, JSON.stringify(map, null, 2));
}

// ───────────────────────────── Audio (WAV estéreo) ─────────────────────────────

const SAMPLE_RATE = 22050;

function encodeWav(left, right) {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(2, 22); // estéreo
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    buffer.writeInt16LE(Math.round(clamp(left[i]) * 32767), 44 + i * 4);
    buffer.writeInt16LE(Math.round(clamp(right[i]) * 32767), 46 + i * 4);
  }
  return buffer;
}

// sample(t, progress) devuelve [izquierda, derecha]; se aplica un fade-out corto para evitar clics
function synth(durationSec, sample) {
  const frames = Math.floor(durationSec * SAMPLE_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const [l, r] = sample(t, i / frames);
    const fade = Math.min(1, (frames - i) / (SAMPLE_RATE * 0.01));
    left[i] = l * fade;
    right[i] = r * fade;
  }
  return encodeWav(left, right);
}

// Oscilador con frecuencia variable: acumula la fase para que los barridos de tono suenen limpios
function oscillator(wave) {
  let phase = 0;
  return (freq) => {
    phase = (phase + freq / SAMPLE_RATE) % 1;
    if (wave === 'square') return phase < 0.5 ? 1 : -1;
    if (wave === 'triangle') return 1 - 4 * Math.abs(phase - 0.5);
    return Math.sin(phase * Math.PI * 2);
  };
}

function lowPassNoise(seed, smoothing) {
  const random = seededRandom(seed);
  let value = 0;
  return () => (value += (random() * 2 - 1 - value) * smoothing);
}

function generateSounds() {
  const lerp = (a, b, p) => a + (b - a) * p;

  // Salto: barrido ascendente de onda cuadrada
  const jumpOsc = oscillator('square');
  write('audio/jump.wav', synth(0.16, (t, p) => {
    const v = jumpOsc(lerp(280, 720, p)) * 0.22 * (1 - p);
    return [v, v];
  }));

  // Dash: ráfaga de ruido que viaja de izquierda a derecha
  const dashNoise = lowPassNoise(7, 0.25);
  write('audio/dash.wav', synth(0.22, (t, p) => {
    const v = dashNoise() * 0.9 * Math.sin(Math.PI * p);
    return [v * (1 - p), v * p];
  }));

  // Ataque: "swish" de ruido + tono descendente
  const attackNoise = lowPassNoise(13, 0.6);
  const attackOsc = oscillator('sine');
  write('audio/attack.wav', synth(0.1, (t, p) => {
    const v = (attackNoise() * 0.5 + attackOsc(lerp(900, 250, p)) * 0.25) * (1 - p);
    return [v, v];
  }));

  // Daño recibido: cuadrada descendente con vibrato
  const hurtOsc = oscillator('square');
  write('audio/hurt.wav', synth(0.28, (t, p) => {
    const v = hurtOsc(lerp(420, 140, p) + Math.sin(t * 60) * 25) * 0.25 * (1 - p);
    return [v, v];
  }));

  // Muerte: caída lenta de tono con la derecha ligeramente desafinada (efecto "coro" estéreo)
  const deathL = oscillator('triangle');
  const deathR = oscillator('triangle');
  write('audio/death.wav', synth(0.9, (t, p) => {
    const freq = lerp(520, 55, p);
    const env = 0.4 * (1 - p);
    return [deathL(freq) * env, deathR(freq * 1.015) * env];
  }));

  // Disparo enemigo: tono corto descendente
  const shootOsc = oscillator('square');
  write('audio/shoot.wav', synth(0.12, (t, p) => {
    const v = shootOsc(lerp(980, 460, p)) * 0.15 * (1 - p);
    return [v, v];
  }));

  // Impacto sobre un enemigo: golpe grave + chasquido
  const hitOsc = oscillator('sine');
  const hitNoise = lowPassNoise(21, 0.8);
  write('audio/hit.wav', synth(0.12, (t, p) => {
    const v = (hitOsc(lerp(180, 60, p)) * 0.6 + hitNoise() * 0.3 * (1 - p * 4)) * (1 - p);
    return [v, v];
  }));
}

console.log('Generando recursos provisionales en public/assets:');
const tileset = generateTileset();
generateMap(tileset);
generateSounds();
