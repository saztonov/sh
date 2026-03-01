import type { CourseMapping } from '@homework/shared';

/**
 * Resolve a Google Classroom course name to a school subject
 * using the course_mappings table data.
 *
 * @param classroomName - The full course name from Google Classroom
 * @param mappings      - Course mappings from the database, sorted by priority DESC
 * @returns The resolved subject name, or null if no mapping matches
 *          (null subject in a mapping means "ignore this course")
 */
export function resolveSubject(
  classroomName: string,
  mappings: CourseMapping[],
): string | null {
  const nameLower = classroomName.toLowerCase();

  // Sort by priority descending so higher-priority mappings win
  const sorted = [...mappings].sort((a, b) => b.priority - a.priority);

  for (const mapping of sorted) {
    if (nameLower.includes(mapping.keyword.toLowerCase())) {
      return mapping.subject;
    }
  }

  return null;
}
