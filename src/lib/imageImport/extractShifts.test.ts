import { describe, expect, it } from 'vitest';
import { applyConfirmedYear, extractShiftsFromWords, needsYearConfirmation } from './extractShifts';
import { mergeCertainImageDuplicates, findPossibleCalendarDuplicate } from './dedupe';
import { resolveOcrWords, wordsFromPlainText } from './ocrWords';
import type { OcrWord } from './types';

function w(text: string, x: number, y: number, width = Math.max(24, text.length * 7), height = 16): OcrWord {
  return { text, x, y, width, height };
}

const listWords: OcrWord[] = [
  w('October', 80, 20),
  w('2026', 160, 20),
  w('17', 20, 70),
  w('Saturday', 50, 70),
  w('Preference:', 80, 92),
  w('Available', 180, 92),
  w('18', 20, 130),
  w('Sunday', 50, 130),
  w('6:00', 80, 152),
  w('PM', 118, 152),
  w('-', 140, 152, 10),
  w('11:00', 155, 152),
  w('PM', 198, 152),
  w('Servitør,', 80, 174),
  w('Basso', 150, 174),
  w('Social', 195, 174),
  w('Oslo', 245, 174),
  w('AS', 280, 174),
  w('19', 20, 210),
  w('Monday', 50, 210),
  w('6:00', 80, 232),
  w('PM', 118, 232),
  w('-', 140, 232, 10),
  w('10:00', 155, 232),
  w('PM', 198, 232),
  w('Servitør,', 80, 254),
  w('Basso', 150, 254),
  w('Social', 195, 254),
  w('Oslo', 245, 254),
  w('AS', 280, 254),
  w('20', 20, 290),
  w('Tuesday', 50, 290),
  w('Preference:', 80, 312),
  w('Available', 180, 312),
  w('22', 20, 350),
  w('Thursday', 50, 350),
  w('6:00', 80, 372),
  w('PM', 118, 372),
  w('-', 140, 372, 10),
  w('10:00', 155, 372),
  w('PM', 198, 372),
  w('Servitør,', 80, 394),
  w('Basso', 150, 394),
  w('Social', 195, 394),
  w('Oslo', 245, 394),
  w('AS', 280, 394),
];

const gridWords: OcrWord[] = [
  w('Basso', 20, 10),
  w('Social', 70, 10),
  w('Oslo', 130, 10),
  w('AS', 170, 10),
  w('Oct', 220, 10),
  w('M', 100, 50, 16),
  w('T', 200, 50, 16),
  w('W', 300, 50, 16),
  w('T', 400, 50, 16),
  w('F', 500, 50, 16),
  w('S', 600, 50, 16),
  w('S', 700, 50, 16),
  w('19', 100, 74, 24),
  w('20', 200, 74, 24),
  w('21', 300, 74, 24),
  w('22', 400, 74, 24),
  w('23', 500, 74, 24),
  w('24', 600, 74, 24),
  w('25', 700, 74, 24),
  w('Your', 8, 160),
  w('shifts', 48, 160),
  w('6:00pm', 80, 160),
  w('10:00pm', 80, 180),
  w('6:00pm', 380, 160),
  w('10:00pm', 380, 180),
  w('6:00pm', 580, 160),
  w('12:00am', 580, 180),
  w('6:00pm', 680, 160),
  w('12:00am', 680, 180),
  w('Open', 8, 260),
  w('shifts', 50, 260),
  w('5:00pm', 280, 260),
  w('11:00pm', 280, 280),
  w('Chef', 8, 330),
  w('Alejo', 50, 330),
  w('2:00pm', 80, 330),
  w('11:00pm', 80, 350),
];

const overviewWords: OcrWord[] = [
  w('Overview', 20, 10),
  w('Punch', 20, 40),
  w('Clock', 70, 40),
  w('Your', 20, 90),
  w('schedule', 60, 90),
  w('October', 200, 90),
  w('2026', 270, 90),
  w('18', 20, 130),
  w('Sunday', 50, 130),
  w('6:00', 140, 130),
  w('PM', 178, 130),
  w('-', 200, 130, 10),
  w('11:00', 215, 130),
  w('PM', 258, 130),
  w('Servitør,', 140, 152),
  w('Basso', 210, 152),
  w('Social', 255, 152),
  w('Oslo', 305, 152),
  w('AS', 340, 152),
  w('19', 20, 190),
  w('Monday', 50, 190),
  w('6:00', 140, 190),
  w('PM', 178, 190),
  w('-', 200, 190, 10),
  w('10:00', 215, 190),
  w('PM', 258, 190),
  w('Servitør,', 140, 212),
  w('Basso', 210, 212),
  w('Social', 255, 212),
  w('Oslo', 305, 212),
  w('AS', 340, 212),
  w('22', 20, 250),
  w('Thursday', 50, 250),
  w('6:00', 140, 250),
  w('PM', 178, 250),
  w('-', 200, 250, 10),
  w('10:00', 215, 250),
  w('PM', 258, 250),
  w('Servitør,', 140, 272),
  w('Basso', 210, 272),
  w('Social', 255, 272),
  w('Oslo', 305, 272),
  w('AS', 340, 272),
  w('Open', 20, 320),
  w('shifts', 60, 320),
  w('See', 280, 320),
  w('all', 310, 320),
];

describe('shift list template', () => {
  it('keeps dated shifts and ignores Preference: Available', () => {
    const { layout, proposals } = extractShiftsFromWords(listWords);
    expect(layout).toBe('list');
    expect(proposals.map((p) => `${p.eventDate} ${p.startTime}-${p.endTime}`)).toEqual([
      '2026-10-18 18:00-23:00',
      '2026-10-19 18:00-22:00',
      '2026-10-22 18:00-22:00',
    ]);
    expect(proposals[0]?.title).toMatch(/Servitør/i);
    expect(proposals[0]?.location).toMatch(/Basso Social Oslo AS/i);
  });
});

describe('shift grid template', () => {
  it('reads Your shifts columns and skips colleagues and open shifts', () => {
    const { layout, proposals } = extractShiftsFromWords(gridWords);
    expect(layout).toBe('grid');
    expect(proposals.map((p) => `${p.day} ${p.startTime}-${p.endTime}`)).toEqual([
      '19 18:00-22:00',
      '22 18:00-22:00',
      '24 18:00-00:00',
      '25 18:00-00:00',
    ]);
    expect(needsYearConfirmation(proposals)).toBe(true);
    const dated = applyConfirmedYear(proposals, 2026);
    expect(dated[2]?.eventDate).toBe('2026-10-24');
    expect(dated[2]?.endDate).toBe('2026-10-24');
    expect(dated[2]?.overnight).toBe(true);
  });
});

describe('overview template', () => {
  it('reads Your schedule and stops at Open shifts', () => {
    const { layout, proposals } = extractShiftsFromWords(overviewWords);
    expect(layout).toBe('overview');
    expect(proposals).toHaveLength(3);
    expect(proposals.map((p) => p.eventDate)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-22',
    ]);
  });
});

describe('messy OCR', () => {
  it('reads a day number on one line and the weekday on the next', () => {
    const { proposals } = extractShiftsFromWords([
      w('October', 80, 20),
      w('2026', 160, 20),
      w('18', 20, 130),
      w('Sunday', 20, 152),
      w('6:00', 80, 174),
      w('PM', 118, 174),
      w('-', 140, 174, 10),
      w('11:00', 155, 174),
      w('PM', 198, 174),
      w('Servitør,', 80, 196),
      w('Basso', 150, 196),
    ]);
    expect(proposals.map((p) => `${p.eventDate} ${p.startTime}-${p.endTime}`)).toEqual([
      '2026-10-18 18:00-23:00',
    ]);
  });

  it('rebuilds shifts from plain OCR text when boxes are missing', () => {
    const words = wordsFromPlainText(
      ['October 2026', '18 Sunday', '6:00 PM - 11:00 PM', 'Servitør, Basso Social Oslo AS'].join('\n'),
    );
    const { proposals } = extractShiftsFromWords(words);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.eventDate).toBe('2026-10-18');
    expect(proposals[0]?.startTime).toBe('18:00');
    expect(proposals[0]?.endTime).toBe('23:00');
  });

  it('still reads the Your-shifts grid if the label is garbled', () => {
    const garbled = gridWords.map((word) => (word.text === 'shifts' ? { ...word, text: 'shifis' } : word));
    const { proposals } = extractShiftsFromWords(garbled);
    expect(proposals.map((p) => p.day)).toEqual([19, 22, 24, 25]);
  });

  it('falls back to the list when the scored layout finds nothing', () => {
    const mixed: OcrWord[] = [
      w('Your', 8, 10),
      w('shifts', 48, 10),
      w('October', 80, 40),
      w('2026', 160, 40),
      w('18', 20, 80),
      w('Sunday', 50, 80),
      w('6:00', 80, 102),
      w('PM', 118, 102),
      w('-', 140, 102, 10),
      w('11:00', 155, 102),
      w('PM', 198, 102),
      w('Servitør,', 80, 124),
      w('Basso', 150, 124),
    ];
    const { layout, proposals } = extractShiftsFromWords(mixed);
    expect(layout).toBe('list');
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.eventDate).toBe('2026-10-18');
  });
});

describe('ocr word flatten', () => {
  it('uses nested block words when the page has no top-level words', () => {
    const words = resolveOcrWords({
      words: undefined,
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    { text: 'October', bbox: { x0: 80, y0: 20, x1: 140, y1: 36 } },
                    { text: '2026', bbox: { x0: 150, y0: 20, x1: 190, y1: 36 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
      text: 'October 2026',
    });
    expect(words.map((w) => w.text)).toEqual(['October', '2026']);
    expect(words[0]?.x).toBe(80);
  });

  it('falls back to running text when blocks are empty', () => {
    const words = resolveOcrWords({
      words: undefined,
      blocks: null,
      text: '18 Sunday\n6:00 PM - 11:00 PM',
    });
    expect(words.map((w) => w.text)).toEqual(['18', 'Sunday', '6:00', 'PM', '-', '11:00', 'PM']);
  });
});

const shiftOverviewPages = [
  [
    '21:14',
    'Tilbake Shift Overview',
    'October 2026',
    '17 «& Preference: Available',
    '18 «& Preference: Available',
    '6:00PM -11:00PM',
    '.',
    'Servitgr, Basso Social Oslo AS',
    '19',
    '«& Preference: Available',
    'Mon',
    '6:00PM -10:00PM',
    'Servitgr, Basso Social Oslo AS',
    '20 «& Preference: Available',
    '21',
    '«& Preference: Available',
    'Wed',
    '22 «& Preference: Available',
    '6:00PM -10:00PM',
    'Servitgr, Basso Social Oslo AS',
    '2) ed [XN ]',
    'Overview Messages Schedule More',
  ],
  [
    'October 2026',
    '22 «& Preference: Available',
    '6:00PM -10:00PM',
    'Servitgr, Basso Social Oslo AS',
    '23 «& Preference: Available',
    '6:00PM -12:00AM',
    'Servitgr, Basso Social Oslo AS',
    '24 «& Preference: Available',
    '6:00PM -12:00AM',
    'Servitgr, Basso Social Oslo AS',
    '25 «& Preference: Available',
    '26 «& Preference: Available',
    '6:00PM -10:00PM',
    'Servitgr, Basso Social Oslo AS',
    '2) ed [XN ]',
  ],
  [
    'October 2026',
    '26',
    '«& Preference: Available',
    'Mon',
    '6:00PM -10:00PM',
    'Servitgr, Basso Social Oslo AS',
    '27 «& Preference: Available',
    '28',
    '«& Preference: Available',
    'Wed',
    '29 «& Preference: Available',
    '30 «& Preference: Available',
    '6:00PM -11:00PM',
    'Servitgr, Basso Social Oslo AS',
    '31 «& Preference: Available',
    '6:00PM -12:00AM',
    'Servitgr, Basso Social Oslo AS',
    '2) ed [XN ]',
  ],
];

describe('shift overview screenshots', () => {
  it('keeps every shift card and the workplace, and skips preference-only days', () => {
    const pages = shiftOverviewPages.map((lines, index) =>
      extractShiftsFromWords(wordsFromPlainText(lines.join('\n')), index).proposals,
    );
    expect(pages[0]?.map((p) => `${p.eventDate} ${p.startTime}-${p.endTime}`)).toEqual([
      '2026-10-18 18:00-23:00',
      '2026-10-19 18:00-22:00',
      '2026-10-22 18:00-22:00',
    ]);
    expect(pages[1]?.map((p) => `${p.eventDate} ${p.startTime}-${p.endTime}`)).toEqual([
      '2026-10-22 18:00-22:00',
      '2026-10-23 18:00-00:00',
      '2026-10-24 18:00-00:00',
      '2026-10-26 18:00-22:00',
    ]);
    expect(pages[2]?.map((p) => `${p.eventDate} ${p.startTime}-${p.endTime}`)).toEqual([
      '2026-10-26 18:00-22:00',
      '2026-10-30 18:00-23:00',
      '2026-10-31 18:00-00:00',
    ]);
    for (const proposal of pages.flat()) {
      expect(proposal.title).toBe('Servitør');
      expect(proposal.location).toBe('Basso Social Oslo AS');
    }
    expect(pages[1]?.find((p) => p.day === 23)?.overnight).toBe(true);
    expect(pages[1]?.find((p) => p.day === 23)?.endDate).toBe('2026-10-23');
    expect(pages[2]?.find((p) => p.day === 31)?.endDate).toBe('2026-10-31');

    const merged = mergeCertainImageDuplicates(pages.flat());
    expect(merged.map((p) => p.eventDate)).toEqual([
      '2026-10-18',
      '2026-10-19',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-26',
      '2026-10-30',
      '2026-10-31',
    ]);
    expect(merged.find((p) => p.eventDate === '2026-10-22')?.mergedFromImages).toBe(2);
    expect(merged.find((p) => p.eventDate === '2026-10-26')?.mergedFromImages).toBe(2);
  });
});

describe('shift card crop', () => {
  it('frames the whole card when the photo size is known', () => {
    const words: OcrWord[] = [
      w('October', 80, 338, 180, 40),
      w('2026', 280, 338, 120, 40),
      w('18', 50, 664, 74, 101),
      w('Preference:', 268, 690, 298, 43),
      w('Available', 585, 689, 234, 44),
      w('6:00PM', 219, 860, 224, 42),
      w('-11:00PM', 463, 860, 281, 42),
      w('Servitgr,', 218, 936, 169, 40),
      w('Basso', 406, 938, 117, 31),
      w('Social', 537, 936, 118, 33),
      w('Oslo', 670, 937, 88, 32),
      w('AS', 771, 938, 55, 31),
    ];
    const { proposals } = extractShiftsFromWords(words, 0, { width: 1125, height: 2436 });
    const crop = proposals[0]?.crop;
    expect(crop?.imageWidth).toBe(1125);
    expect(crop?.imageHeight).toBe(2436);
    expect(crop && crop.x).toBeLessThan(200);
    expect(crop && crop.y).toBeLessThan(840);
    expect(crop && crop.x + crop.width).toBeGreaterThan(1000);
    expect(crop && crop.y + crop.height).toBeGreaterThan(1000);
    expect(crop && crop.y + crop.height).toBeLessThan(1100);
  });
});

describe('duplicates', () => {
  it('merges the same shift seen in two screenshots', () => {
    const list = extractShiftsFromWords(listWords, 0).proposals;
    const overview = extractShiftsFromWords(overviewWords, 1).proposals;
    const merged = mergeCertainImageDuplicates([...list, ...overview]);
    expect(merged).toHaveLength(3);
    expect(merged.find((p) => p.eventDate === '2026-10-18')?.mergedFromImages).toBe(2);
  });

  it('marks a possible calendar hit without dropping the proposal', () => {
    const proposal = extractShiftsFromWords(listWords).proposals[0]!;
    const hit = findPossibleCalendarDuplicate(proposal, [
      {
        id: 'evt-1',
        title: 'Servitør',
        event_date: '2026-10-18',
        start_time: '18:00:00',
        end_time: '23:00:00',
      },
    ]);
    expect(hit?.eventId).toBe('evt-1');
    expect(proposal.eventDate).toBe('2026-10-18');
  });
});
