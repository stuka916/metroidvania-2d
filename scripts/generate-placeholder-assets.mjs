// Genera recursos provisionales para el prototipo (sin dependencias, solo Node):
//   - public/assets/images/tileset.png        → 4 baldosas de 32x32
//   - public/assets/tilemaps/level1.json      → mapas en formato Tiled JSON (ábrelos y edítalos con Tiled)
//   - public/assets/tilemaps/level2.json
//   - public/assets/audio/*.wav               → efectos de sonido estéreo sintetizados
//
// Uso: npm run assets:generate            (no sobrescribe los mapas que ya existen)
//      npm run assets:generate -- --force (regenera también los mapas)

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

// ───────────────────────────── Mapas (Tiled JSON) ─────────────────────────────

const MAP_HEIGHT = 20;
const FLOOR_ROW = 18;
const FLOOR_Y = FLOOR_ROW * TILE;

// Altura de cada entidad, para colocar su punto de aparición justo sobre el suelo
const HEIGHTS = { player: 40, dummy: 36, shooter: 32, lever: 24 };

function tiledProperties(properties) {
  return Object.entries(properties).map(([name, value]) => ({
    name,
    type: typeof value === 'number' ? 'float' : typeof value === 'boolean' ? 'bool' : 'string',
    value,
  }));
}

// Objeto punto (spawns, enemigos, palancas): (x, y) es el centro de la entidad
function point(type, name, x, surfaceY, height, properties) {
  return { type, name, x, y: surfaceY - height / 2, width: 0, height: 0, point: true, properties };
}

// Objeto rectángulo (puertas, barreras): en Tiled (x, y) es la esquina superior izquierda
function rect(type, name, x, y, width, height, properties) {
  return { type, name, x, y, width, height, properties };
}

function buildMap({ width, tiles, objects, properties }) {
  const data = new Array(width * MAP_HEIGHT).fill(0);
  for (const [x1, x2, y1, y2, tile] of tiles) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) data[y * width + x] = tile;
  }

  return {
    compressionlevel: -1,
    width,
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
    properties: tiledProperties(properties),
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width, height: MAP_HEIGHT, x: 0, y: 0, opacity: 1, visible: true, data },
      {
        id: 2,
        name: 'entities',
        type: 'objectgroup',
        draworder: 'topdown',
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        objects: objects.map(({ properties: objectProperties, ...object }, i) => ({
          id: i + 1,
          rotation: 0,
          visible: true,
          ...object,
          ...(objectProperties ? { properties: tiledProperties(objectProperties) } : {}),
        })),
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'tileset',
        image: '../images/tileset.png',
        imagewidth: TILE * Object.keys(T).length,
        imageheight: TILE,
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: Object.keys(T).length,
        columns: Object.keys(T).length,
        margin: 0,
        spacing: 0,
        // Propiedad personalizada de Tiled: el juego hace colisionables las baldosas con collides = true
        tiles: Object.values(T).map((gid) => ({
          id: gid - 1,
          properties: [{ name: 'collides', type: 'bool', value: true }],
        })),
      },
    ],
  };
}

// Zona 1: exterior. Al este hay una barrera que se abre con una palanca y, tras ella, la puerta a la zona 2
function level1() {
  const width = 70;
  const GATE_COL = 54;
  const GATE_TOP_ROW = 12;

  return buildMap({
    width,
    properties: { zoneName: 'Zona 1 · Exterior', backgroundColor: '#1d1d2b' },
    tiles: [
      [0, width - 1, FLOOR_ROW, FLOOR_ROW, T.GRASS], // suelo
      [0, width - 1, 19, 19, T.DIRT],
      [12, 17, 15, 15, T.WOOD], // plataforma A
      [24, 28, 11, 11, T.WOOD], // plataforma B
      [31, 32, 6, 17, T.STONE], // pilar para wall slide / wall jump
      [36, 42, 13, 13, T.WOOD], // plataforma C (patrulla)
      [44, 48, 9, 9, T.WOOD], // plataforma D (palanca)
      [GATE_COL, GATE_COL, 0, GATE_TOP_ROW - 1, T.STONE], // muro sobre la barrera: no se puede saltar por encima
      [58, 61, 14, 14, T.WOOD], // sección tras la barrera
    ],
    objects: [
      point('spawn', 'start', 112, FLOOR_Y, HEIGHTS.player),
      point('spawn', 'from-level2', 64 * TILE, FLOOR_Y, HEIGHTS.player),
      point('dummy', 'dummy-floor', 320, FLOOR_Y, HEIGHTS.dummy),
      point('dummy', 'dummy-patrol', 39.5 * TILE, 13 * TILE, HEIGHTS.dummy, { patrolRange: 80 }),
      point('shooter', 'shooter-pillar', 32 * TILE, 6 * TILE, HEIGHTS.shooter),
      // La palanca abre el objeto cuyo nombre indica "target"
      point('lever', 'lever-east', 47.5 * TILE, 9 * TILE, HEIGHTS.lever, { target: 'gate-east' }),
      rect('gate', 'gate-east', GATE_COL * TILE, GATE_TOP_ROW * TILE, TILE, (FLOOR_ROW - GATE_TOP_ROW) * TILE),
      point('dummy', 'dummy-east', 60 * TILE, 14 * TILE, HEIGHTS.dummy),
      rect('door', 'door-to-level2', 66 * TILE, FLOOR_Y - 64, 40, 64, { targetMap: 'level2', targetSpawn: 'from-level1' }),
    ],
  });
}

// Zona 2: caverna, con una chimenea entre el pilar y el borde del mapa para practicar wall jumps
function level2() {
  const width = 40;

  return buildMap({
    width,
    properties: { zoneName: 'Zona 2 · Caverna', backgroundColor: '#120f1f' },
    tiles: [
      [0, width - 1, FLOOR_ROW, FLOOR_ROW, T.STONE],
      [0, width - 1, 19, 19, T.DIRT],
      [0, width - 1, 0, 0, T.STONE], // techo
      [8, 12, 15, 15, T.WOOD],
      [15, 19, 12, 12, T.WOOD],
      [22, 26, 9, 9, T.WOOD],
      [35, 35, 6, 17, T.STONE], // chimenea: pilar + borde derecho del mapa
      [29, 33, 6, 6, T.WOOD],
    ],
    objects: [
      point('spawn', 'from-level1', 4 * TILE, FLOOR_Y, HEIGHTS.player),
      rect('door', 'door-to-level1', 1 * TILE, FLOOR_Y - 64, 40, 64, { targetMap: 'level1', targetSpawn: 'from-level2' }),
      point('dummy', 'dummy-cave', 20 * TILE, FLOOR_Y, HEIGHTS.dummy, { patrolRange: 120 }),
      point('shooter', 'shooter-cave', 24.5 * TILE, 9 * TILE, HEIGHTS.shooter),
      point('dummy', 'dummy-top', 31.5 * TILE, 6 * TILE, HEIGHTS.dummy),
    ],
  });
}

function generateMaps() {
  for (const [name, build] of Object.entries({ level1, level2 })) {
    const mapPath = `tilemaps/${name}.json`;
    if (existsSync(join(ASSETS, mapPath)) && !FORCE) {
      console.log(`  – ${mapPath} ya existe (usa --force para regenerarlo)`);
      continue;
    }
    write(mapPath, JSON.stringify(build(), null, 2));
  }
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

  // Palanca: dos "clics" cuadrados (grave y agudo)
  const switchOsc = oscillator('square');
  write('audio/switch.wav', synth(0.16, (t, p) => {
    const v = switchOsc(p < 0.4 ? 520 : 880) * 0.18 * (1 - (p % 0.5) * 2);
    return [v, v];
  }));

  // Barrera abriéndose: retumbar grave con el ruido algo distinto en cada canal
  const gateL = lowPassNoise(31, 0.05);
  const gateR = lowPassNoise(37, 0.05);
  const gateOsc = oscillator('triangle');
  write('audio/gate.wav', synth(0.7, (t, p) => {
    const env = Math.sin(Math.PI * Math.min(1, p * 1.4)) * 0.8;
    const tone = gateOsc(lerp(70, 45, p)) * 0.3;
    return [(gateL() * 3 + tone) * env, (gateR() * 3 + tone) * env];
  }));

  // Puerta / cambio de zona: barrido grave ascendente con ruido suave
  const doorOsc = oscillator('sine');
  const doorNoise = lowPassNoise(43, 0.1);
  write('audio/door.wav', synth(0.4, (t, p) => {
    const v = (doorOsc(lerp(110, 330, p)) * 0.35 + doorNoise() * 0.6) * Math.sin(Math.PI * p);
    return [v, v];
  }));
}

console.log('Generando recursos provisionales en public/assets:');
generateTileset();
generateMaps();
generateSounds();
