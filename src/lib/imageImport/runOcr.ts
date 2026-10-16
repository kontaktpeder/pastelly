import { resolveOcrWords } from './ocrWords';
import type { OcrWord } from './types';

export type OcrPage = {
  words: OcrWord[];
  text: string;
};

export async function recognizeImagePages(imageUrls: string[]): Promise<OcrPage[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const pages: OcrPage[] = [];
    for (const url of imageUrls) {
      const result = await worker.recognize(url, {}, { text: true, blocks: true });
      const data = result.data as typeof result.data & { words?: { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }[] };
      const words = resolveOcrWords({
        words: data.words,
        blocks: data.blocks,
        text: data.text,
      });
      pages.push({
        words,
        text: (data.text ?? words.map((word) => word.text).join(' ')).trim(),
      });
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
