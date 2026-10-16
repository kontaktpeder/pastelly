export type ShiftLayout = 'list' | 'grid' | 'overview';

export type OcrWord = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
};

export type ShiftProposal = {
  id: string;
  layout: ShiftLayout;
  title: string;
  location: string | null;
  month: number;
  day: number;
  year: number | null;
  yearKnown: boolean;
  eventDate: string | null;
  endDate: string | null;
  startTime: string;
  endTime: string;
  overnight: boolean;
  crop: ImageCrop;
  sourceImageIndex: number;
  mergedFromImages: number;
};

export type CalendarDuplicate = {
  eventId: string;
  title: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
};

export type ImportVisibility = 'all_members' | 'private' | 'selected_members';
