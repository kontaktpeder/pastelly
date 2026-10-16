import type { OcrWord } from './types';

export async function recognizeImagePages(imageUrls: string[]): Promise<OcrWord[][]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const pages: OcrWord[][] = [];
    for (const url of imageUrls) {
      const result = await worker.recognize(url);
      pages.push(
        (result.data.words ?? [])
          .filter((word) => word.text.trim().length > 0)
          .map((word) => ({
            text: word.text,
            x: word.bbox.x0,
            y: word.bbox.y0,
            width: word.bbox.x1 - word.bbox.x0,
            height: word.bbox.y1 - word.bbox.y0,
          })),
      );
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}
