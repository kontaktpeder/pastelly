import { clusterLines, cropFromWords, imageBounds, wordCenterX, type OcrLine } from './ocrWords';
import {
  finishShiftDates,
  isIgnoreLine,
  isOpenShiftsLabel,
  isSkippableRoleLine,
  isYourScheduleLabel,
  isYourShiftsLabel,
  monthFromText,
  parseDayHeader,
  parseRoleAndPlace,
  parseTimeRange,
  yearFromText,
} from './parseClock';
import type { OcrWord, ShiftLayout, ShiftProposal } from './types';

export type ExtractedPage = {
  layout: ShiftLayout;
  proposals: ShiftProposal[];
};

function newId(prefix: string, index: number): string {
  return `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

function headerContext(lines: OcrLine[]): { month: number | null; year: number | null } {
  let month: number | null = null;
  let year: number | null = null;
  for (const line of lines) {
    month = month ?? monthFromText(line.text);
    year = year ?? yearFromText(line.text);
    if (month && year) break;
  }
  return { month, year };
}

function scoreLayout(text: string): ShiftLayout {
  const t = text.toLowerCase();
  const scores: Record<ShiftLayout, number> = { list: 0, grid: 0, overview: 0 };
  if (/\bpreference\b/.test(t) || /\bshift\s+overview\b/.test(t)) scores.list += 3;
  if (/\bavailable\b/.test(t)) scores.list += 1;
  if (/\byour\s+sh\w{2,8}\b/.test(t) || /\bdine\s+vakter\b/.test(t)) scores.grid += 3;
  if (/\bopen\s*shifts?\b/.test(t)) scores.grid += 1;
  if (/\byour\s+schedule\b/.test(t) || /\bdin\s+timeplan\b/.test(t)) scores.overview += 3;
  if (/\bpunch\s*clock\b/.test(t) || /\boverview\b/.test(t)) scores.overview += 1;
  const winner = (Object.entries(scores) as [ShiftLayout, number][]).sort((a, b) => b[1] - a[1])[0];
  return winner[1] > 0 ? winner[0] : 'list';
}

function findDayLookingBack(lines: OcrLine[], index: number): number | null {
  for (let i = index; i >= Math.max(0, index - 8); i--) {
    const day = parseDayHeader(lines[i]!.text);
    if (day != null) return day;
  }
  return null;
}

function toProposal(
  input: {
    layout: ShiftLayout;
    title: string;
    location: string | null;
    month: number;
    day: number;
    year: number | null;
    startTime: string;
    endTime: string;
    words: OcrWord[];
    imageWidth: number;
    imageHeight: number;
    sourceImageIndex: number;
    index: number;
  },
): ShiftProposal {
  const dates = finishShiftDates(input);
  return {
    id: newId(input.layout, input.index),
    layout: input.layout,
    title: input.title || 'Jobb',
    location: input.location,
    month: input.month,
    day: input.day,
    year: input.year,
    yearKnown: input.year != null,
    eventDate: dates.eventDate,
    endDate: dates.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    overnight: dates.overnight,
    crop: cropFromWords(input.words, input.imageWidth, input.imageHeight),
    sourceImageIndex: input.sourceImageIndex,
    mergedFromImages: 1,
  };
}

function extractList(
  lines: OcrLine[],
  words: OcrWord[],
  sourceImageIndex: number,
): ShiftProposal[] {
  const { width, height } = imageBounds(words);
  const header = headerContext(lines);
  const month = header.month ?? 10;
  const year = header.year;
  const out: ShiftProposal[] = [];
  let currentDay: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const range = parseTimeRange(line.text);
    const day = parseDayHeader(line.text);
    if (day != null && !range) {
      currentDay = day;
      continue;
    }
    if (!range || isIgnoreLine(line.text)) continue;

    const dayForShift = day ?? currentDay ?? findDayLookingBack(lines, i);
    if (dayForShift == null) continue;
    currentDay = dayForShift;

    const follow: OcrLine[] = [];
    for (let j = i + 1; j < lines.length && follow.length < 3; j++) {
      const next = lines[j]!;
      if (parseDayHeader(next.text) || parseTimeRange(next.text) || isIgnoreLine(next.text)) break;
      if (isSkippableRoleLine(next.text)) {
        if (follow.length > 0) break;
        continue;
      }
      follow.push(next);
    }
    const rest = parseRoleAndPlace(follow.map((l) => l.text).join(' ') || line.text);
    out.push(
      toProposal({
        layout: 'list',
        title: rest.title,
        location: rest.location,
        month,
        day: dayForShift,
        year,
        startTime: range.startTime,
        endTime: range.endTime,
        words: [...line.words, ...follow.flatMap((l) => l.words)],
        imageWidth: width,
        imageHeight: height,
        sourceImageIndex,
        index: out.length,
      }),
    );
  }
  return out;
}

function extractOverview(lines: OcrLine[], words: OcrWord[], sourceImageIndex: number): ShiftProposal[] {
  const startIdx = lines.findIndex((l) => isYourScheduleLabel(l.text));
  const endIdx = lines.findIndex((l, i) => i > startIdx && isOpenShiftsLabel(l.text));
  const band = lines.slice(startIdx >= 0 ? startIdx : 0, endIdx >= 0 ? endIdx : lines.length);
  return extractList(band, words, sourceImageIndex).map((p) => ({ ...p, layout: 'overview' }));
}

function extractGrid(lines: OcrLine[], words: OcrWord[], sourceImageIndex: number): ShiftProposal[] {
  const { width, height } = imageBounds(words);
  const header = headerContext(lines);
  const month = header.month ?? 10;
  const year = header.year;
  const labeled = lines.find((l) => isYourShiftsLabel(l.text));
  const dateLine = [...lines]
    .reverse()
    .find((l) => (!labeled || l.y < labeled.y) && (l.text.match(/\b\d{1,2}\b/g) ?? []).length >= 5);
  const timeLine =
    labeled ??
    lines.find(
      (l) =>
        !!dateLine &&
        l.y > dateLine.y + 4 &&
        parseTimeRange(l.text) &&
        !isOpenShiftsLabel(l.text) &&
        !isIgnoreLine(l.text),
    );
  if (!timeLine) return [];
  const nextSection = lines.find((l) => l.y > timeLine.y + 8 && (isOpenShiftsLabel(l.text) || parseDayHeader(l.text) === null && /chef|open|ledig/i.test(l.text)));
  const rowTop = timeLine.y - 6;
  const rowBottom = nextSection ? nextSection.y - 4 : timeLine.y + 90;

  const dateWords = (dateLine?.words ?? words.filter((w) => w.y < timeLine.y && /^\d{1,2}$/.test(w.text)))
    .filter((w) => {
      const n = Number(w.text);
      return n >= 1 && n <= 31;
    })
    .sort((a, b) => a.x - b.x);

  if (dateWords.length === 0) return [];

  const columns = dateWords.map((w) => ({
    day: Number(w.text),
    x: wordCenterX(w),
  }));

  const rowWords = words.filter((w) => wordCenterX(w) && w.y >= rowTop && w.y <= rowBottom && !isYourShiftsLabel(w.text) && !isYourScheduleLabel(w.text));
  const byCol = new Map<number, OcrWord[]>();
  for (const word of rowWords) {
    let best = columns[0]!;
    let bestDist = Math.abs(wordCenterX(word) - best.x);
    for (const col of columns) {
      const dist = Math.abs(wordCenterX(word) - col.x);
      if (dist < bestDist) {
        best = col;
        bestDist = dist;
      }
    }
    if (bestDist > 70) continue;
    const list = byCol.get(best.day) ?? [];
    list.push(word);
    byCol.set(best.day, list);
  }

  const out: ShiftProposal[] = [];
  for (const col of columns) {
    const colWords = (byCol.get(col.day) ?? []).sort((a, b) => a.y - b.y || a.x - b.x);
    const range = parseTimeRange(colWords.map((w) => w.text).join(' '));
    if (!range) continue;
    out.push(
      toProposal({
        layout: 'grid',
        title: 'Jobb',
        location: null,
        month,
        day: col.day,
        year,
        startTime: range.startTime,
        endTime: range.endTime,
        words: colWords,
        imageWidth: width,
        imageHeight: height,
        sourceImageIndex,
        index: out.length,
      }),
    );
  }
  return out;
}

export function extractShiftsFromWords(
  words: OcrWord[],
  sourceImageIndex = 0,
): ExtractedPage {
  const usable = words.filter((w) => w.text.trim().length > 0);
  const lines = clusterLines(usable);
  const scored = scoreLayout(lines.map((l) => l.text).join('\n'));
  const byLayout: Record<ShiftLayout, ShiftProposal[]> = {
    list: extractList(lines, usable, sourceImageIndex),
    grid: extractGrid(lines, usable, sourceImageIndex),
    overview: extractOverview(lines, usable, sourceImageIndex),
  };
  let layout = scored;
  let proposals = byLayout[scored];
  for (const candidate of ['list', 'grid', 'overview'] as ShiftLayout[]) {
    if (byLayout[candidate].length > proposals.length) {
      layout = candidate;
      proposals = byLayout[candidate];
    }
  }
  return { layout, proposals };
}

export function applyConfirmedYear(proposals: ShiftProposal[], year: number): ShiftProposal[] {
  return proposals.map((p) => {
    if (p.yearKnown && p.year) return p;
    const dates = finishShiftDates({
      year,
      month: p.month,
      day: p.day,
      startTime: p.startTime,
      endTime: p.endTime,
    });
    return {
      ...p,
      year,
      yearKnown: true,
      eventDate: dates.eventDate,
      endDate: dates.endDate,
      overnight: dates.overnight,
    };
  });
}

export function needsYearConfirmation(proposals: ShiftProposal[]): boolean {
  return proposals.some((p) => !p.yearKnown);
}
