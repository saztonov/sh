/**
 * CSS selectors for Google Classroom scraping.
 * Ported from OLD/fetch_classroom.py and adapted for Playwright.
 */

export const SELECTORS = {
  // Course list page (classroom.google.com/u/0/h)
  courseCard: 'div.GRvzhf.YVvGBb',

  // Assignment list page (/u/0/a/not-turned-in/all)
  sectionHeader: 'div.ovsVve.jlxRme',
  sectionExpandButton: 'div.ovsVve.jlxRme',
  assignmentItem: 'li.MHxtic',
  assignmentLink: 'a.PsLuqe',

  // Assignment detail page
  detailTitle: 'h1',
  detailAuthorDate: '.rSCfjc',
  detailPoints: '.jIIjdd',
  detailDueDate: '.c3mZkd',
  detailDescription: '.oBSRLe',
  detailAttachment: '.QRiHXd',
  detailAttachmentLink: '.QRiHXd a',
  detailAttachmentName: '.QRiHXd .dDKhVc',
} as const;

/** Section titles that should be expanded and scraped. */
export const ALLOWED_SECTIONS = ['На этой неделе', 'Следующая неделя'] as const;

/** Course names in the sidebar to ignore. */
export const EXCLUDED_TITLES = new Set([
  'Календарь',
  'Список заданий',
  'Архив курсов',
  'Настройки',
]);
