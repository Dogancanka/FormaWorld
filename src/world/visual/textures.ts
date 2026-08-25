import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// Procedural materials keep the repo asset-free while giving buildings a
// handcrafted miniature look. Textures are cached module-level so scene
// re-renders never regenerate canvases.
const cache = new Map<string, CanvasTexture>();

function shiftColor(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const next = Math.min(255, Math.max(0, Math.round(((value >> shift) & 255) * (1 + amount))));
    return next.toString(16).padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export function brickTexture(base = "#a9805f", mortar = "#e8e0cf", repeat: [number, number] = [1, 1]): CanvasTexture {
  const key = `brick:${base}:${mortar}:${repeat[0]}:${repeat[1]}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for brick texture.");
  context.fillStyle = mortar;
  context.fillRect(0, 0, 256, 256);
  const rows = 10;
  const rowHeight = 256 / rows;
  const brickWidth = 56;
  for (let row = 0; row < rows; row += 1) {
    const offset = row % 2 === 0 ? 0 : brickWidth / 2;
    for (let x = -brickWidth; x < 256 + brickWidth; x += brickWidth) {
      const seed = (row * 7 + Math.round(x / brickWidth) * 13) % 5;
      context.fillStyle = shiftColor(base, seed * .045 - .09);
      context.fillRect(x + offset + 2, row * rowHeight + 2, brickWidth - 4, rowHeight - 4);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

// Soft mottled grass carpet used on the green district tops. The base fill and
// scattered blades stay close in tone so the cap keeps the calm model look
// while reading as lawn rather than painted plastic.
export function grassTexture(base = "#9db98a", repeat: [number, number] = [1, 1]): CanvasTexture {
  const key = `grass:${base}:${repeat[0]}:${repeat[1]}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for grass texture.");
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let patch = 0; patch < 46; patch += 1) {
    context.fillStyle = shiftColor(base, random() * .17 - .1);
    context.beginPath();
    context.ellipse(random() * 256, random() * 256, 12 + random() * 26, 8 + random() * 18, random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  for (let blade = 0; blade < 420; blade += 1) {
    const x = random() * 256;
    const y = random() * 256;
    context.strokeStyle = shiftColor(base, random() * .3 - .16);
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + random() * 3 - 1.5, y - 3 - random() * 4);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}
export function shingleTexture(base = "#7d5142", seam = "#e8e0cf"): CanvasTexture {
  const key = `shingle:${base}:${seam}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for shingle texture.");
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  const rows = 8;
  const rowHeight = 256 / rows;
  for (let row = 0; row < rows; row += 1) {
    context.fillStyle = shiftColor(base, row % 2 === 0 ? .05 : -.06);
    context.fillRect(0, row * rowHeight, 256, rowHeight - 3);
    context.fillStyle = seam;
    context.fillRect(0, row * rowHeight + rowHeight - 3, 256, 3);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

// Packed-earth surface for the compound paths and district ground pads. The
// speckle keeps a large flat rectangle from reading as a painted plane while
// staying calm enough to sit under buildings and entities.
export function dirtTexture(base = "#b8926a", repeat: [number, number] = [1, 1]): CanvasTexture {
  const key = `dirt:${base}:${repeat[0]}:${repeat[1]}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable for dirt texture.");
  context.fillStyle = base;
  context.fillRect(0, 0, 128, 128);
  let seed = 23;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let patch = 0; patch < 34; patch += 1) {
    context.fillStyle = shiftColor(base, random() * .14 - .09);
    context.beginPath();
    context.ellipse(random() * 128, random() * 128, 6 + random() * 16, 4 + random() * 12, random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  for (let grit = 0; grit < 240; grit += 1) {
    context.fillStyle = shiftColor(base, random() * .26 - .15);
    context.fillRect(random() * 128, random() * 128, 1 + random(), 1 + random());
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}
