export interface ScheduleSlot {
  id: string;
  day_of_week: DayOfWeek;
  lesson_number: number;
  time_start: string | null;
  time_end: string | null;
  subject: string;
}

export type DayOfWeek = 1 | 2 | 3 | 4 | 5;

export interface MergedScheduleDay {
  dayOfWeek: DayOfWeek;
  dayName: string;
  date: string;
  slots: MergedSlot[];
}

export interface MergedSlot {
  lessonNumber: number;
  timeStart: string | null;
  timeEnd: string | null;
  subject: string;
  assignments: SlotAssignment[];
}

export interface SlotAssignment {
  id: string;
  title: string;
  dueDate: string | null;
  isCompleted: boolean;
  status: string;
}
