import type { ImageCrop, OcrWord } from './types';

export type OcrLine = {
  text: string;
  words: OcrWord[];
  x: number;
  y: number;
  width: number;
  height: number;
};

type BBoxLike = { x0: number; y0: number; x1: number; y1: number };
type WordLike = { text?: string | null; bbox?: BBoxLike | null };
type LineLike = { words?: WordLike[] | null };
type ParaLike = { lines?: LineLike[] | null };
type BlockLike = {
  paragraphs?: ParaLike[] | null;
  lines?: LineLike[] | null;
  words?: WordLike[] | null;
};

export type OcrPageData = {
  words?: WordLike[] | null;
  blocks?: BlockLike[] | null;
  text?: string | null;
};

function wordFromBBox(text: string, bbox: BBoxLike): OcrWord | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return {
    text: trimmed,
    x: bbox.x0,
    y: bbox.y0,
    width: Math.max(1, bbox.x1 - bbox.x0),
    height: Math.max(1, bbox.y1 - bbox.y0),
  };
}

function collectWords(list: WordLike[] | null | undefined, into: OcrWord[]) {
  for (const word of list ?? []) {
    if (!word?.text || !word.bbox) continue;
    const mapped = wordFromBBox(word.text, word.bbox);
    if (mapped) into.push(mapped);
  }
}

export function wordsFromBlocks(blocks: BlockLike[] | null | undefined): OcrWord[] {
  const out: OcrWord[] = [];
  for (const block of blocks ?? []) {
    collectWords(block.words, out);
    for (const line of block.lines ?? []) {
      collectWords(line?.words, out);
    }
    for (const para of block.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        collectWords(line?.words, out);
      }
    }
  }
  return out;
}

/** Synthetic boxes so line clustering still works when Tesseract only returns text. */
export function wordsFromPlainText(text: string): OcrWord[] {
  const words: OcrWord[] = [];
  const rows = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  rows.forEach((line, row) => {
    let x = 8;
    for (const token of line.split(/\s+/).filter(Boolean)) {
      const width = Math.max(16, token.length * 8);
      words.push({
        text: token,
        x,
        y: 12 + row * 22,
        width,
        height: 16,
      });
      x += width + 8;
    }
  });
  return words;
}

export function resolveOcrWords(data: OcrPageData): OcrWord[] {
  const top: OcrWord[] = [];
  collectWords(data.words, top);
  if (top.length) return top;
  const nested = wordsFromBlocks(data.blocks);
  if (nested.length) return nested;
  return wordsFromPlainText(data.text ?? '');
}

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

export function cropFromWords(
  words: OcrWord[],
  imageWidth: number,
  imageHeight: number,
  pad = 8,
): ImageCrop {
  if (words.length === 0) {
    return { x: 0, y: 0, width: imageWidth, height: imageHeight, imageWidth, imageHeight };
  }
  const x = Math.min(...words.map((w) => w.x));
  const y = Math.min(...words.map((w) => w.y));
  const right = Math.max(...words.map((w) => w.x + w.width));
  const bottom = Math.max(...words.map((w) => w.y + w.height));
  return {
    x: Math.max(0, x - pad),
    y: Math.max(0, y - pad),
    width: Math.min(imageWidth, right - x + pad * 2),
    height: Math.min(imageHeight, bottom - y + pad * 2),
    imageWidth,
    imageHeight,
  };
}

/**
 * List cards are wider than the glyphs (padding, trailing icon).
 * Frame that card so the preview shows the same block as in the photo.
 */
export function shiftCardCrop(words: OcrWord[], imageWidth: number, imageHeight: number): ImageCrop {
  const tight = cropFromWords(words, imageWidth, imageHeight, 0);
  if (words.length === 0 || imageWidth <= 1 || imageHeight <= 1) return tight;
  const padY = Math.max(36, Math.round(imageHeight * 0.028));
  const padLeft = Math.max(36, Math.round(imageWidth * 0.06));
  const rightMargin = Math.max(24, Math.round(imageWidth * 0.03));
  const y = Math.max(0, tight.y - padY);
  const bottom = Math.min(imageHeight, tight.y + tight.height + padY);
  const x = Math.max(0, tight.x - padLeft);
  const textRight = tight.x + tight.width;
  const cardRight = imageWidth - rightMargin;
  const right = Math.min(imageWidth, cardRight > textRight ? cardRight : textRight + padLeft);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
    imageWidth,
    imageHeight,
  };
}

export function imageBounds(
  words: OcrWord[],
  known?: { width: number; height: number } | null,
): { width: number; height: number } {
  if (known && known.width > 0 && known.height > 0) return known;
  if (words.length === 0) return { width: 1, height: 1 };
  return {
    width: Math.max(...words.map((w) => w.x + w.width), 1),
    height: Math.max(...words.map((w) => w.y + w.height), 1),
  };
}
