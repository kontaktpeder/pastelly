import type { ImageCrop, OcrWord } from './types';

export type OcrLine = {
  text: string;
  words: OcrWord[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export function wordCenterX(word: OcrWord): number {
  return word.x + word.width / 2;
}

export function wordCenterY(word: OcrWord): number {
  return word.y + word.height / 2;
}

export function clusterLines(words: OcrWord[], yTol = 14): OcrLine[] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: OcrWord[][] = [];
  for (const word of sorted) {
    const last = lines[lines.length - 1];
    if (!last) {
      lines.push([word]);
      continue;
    }
    const mid = last.reduce((sum, w) => sum + wordCenterY(w), 0) / last.length;
    if (Math.abs(wordCenterY(word) - mid) <= yTol) last.push(word);
    else lines.push([word]);
  }
  return lines.map((group) => {
    const ordered = [...group].sort((a, b) => a.x - b.x);
    const x = Math.min(...ordered.map((w) => w.x));
    const y = Math.min(...ordered.map((w) => w.y));
    const right = Math.max(...ordered.map((w) => w.x + w.width));
    const bottom = Math.max(...ordered.map((w) => w.y + w.height));
    return {
      text: ordered.map((w) => w.text).join(' '),
      words: ordered,
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  });
}

export function cropFromWords(words: OcrWord[], imageWidth: number, imageHeight: number): ImageCrop {
  if (words.length === 0) {
    return { x: 0, y: 0, width: imageWidth, height: imageHeight, imageWidth, imageHeight };
  }
  const x = Math.min(...words.map((w) => w.x));
  const y = Math.min(...words.map((w) => w.y));
  const right = Math.max(...words.map((w) => w.x + w.width));
  const bottom = Math.max(...words.map((w) => w.y + w.height));
  const pad = 8;
  return {
    x: Math.max(0, x - pad),
    y: Math.max(0, y - pad),
    width: Math.min(imageWidth, right - x + pad * 2),
    height: Math.min(imageHeight, bottom - y + pad * 2),
    imageWidth,
    imageHeight,
  };
}

export function imageBounds(words: OcrWord[]): { width: number; height: number } {
  if (words.length === 0) return { width: 1, height: 1 };
  return {
    width: Math.max(...words.map((w) => w.x + w.width), 1),
    height: Math.max(...words.map((w) => w.y + w.height), 1),
  };
}
