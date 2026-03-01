// Types
export type {
  Assignment,
  AssignmentStatus,
  AssignmentWithCourse,
  AssignmentDetail,
  Attachment,
  AssignmentFilters,
} from './types/assignment.js';

export type {
  ScheduleSlot,
  DayOfWeek,
  MergedScheduleDay,
  MergedSlot,
  SlotAssignment,
} from './types/schedule.js';

export type {
  Course,
  CourseMapping,
  ScrapeRun,
  TelegramUser,
} from './types/course.js';

// Constants
export { DEFAULT_COURSE_MAP, SUBJECTS } from './constants/course-map.js';
export type { SubjectName } from './constants/course-map.js';
export { DAY_NAMES, DAY_NAMES_SHORT, DAY_ABBREV_TO_WEEKDAY } from './constants/days.js';
export { MONTH_MAP } from './constants/months.js';
