/**
 * CSS selectors for Eljur diary scraping.
 * Based on the HTML structure of the journal-app diary page.
 */

export const ELJUR_SELECTORS = {
  // Day blocks
  day: 'div.dnevnik-day',
  dayHeader: 'div.dnevnik-day__header',
  dayLessons: 'div.dnevnik-day__lessons',

  // Individual lesson
  lesson: 'div.dnevnik-lesson',
  lessonSubject: 'div.dnevnik-lesson__subject',
  lessonHometask: 'div.dnevnik-lesson__hometask',
  lessonTask: 'div.dnevnik-lesson__task',
  lessonAttach: 'div.dnevnik-lesson__attach',

  // Attachment link inside lesson
  attachmentLink: 'a.button.button--outline.button--purple',
  attachmentTitle: 'span.button__title',

  // Navigation link to journal (for userId detection)
  journalLink: 'a[href*="/journal-app/"]',
} as const;

/** Homework text values to skip. */
export const ELJUR_SKIP_TEXTS = new Set([
  'Без задания',
  'без задания',
]);
