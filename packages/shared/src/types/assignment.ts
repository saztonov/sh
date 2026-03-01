export interface Assignment {
  id: string;
  course_id: string;
  classroom_id: string | null;
  classroom_url: string | null;
  title: string;
  description: string | null;
  author: string | null;
  points: number | null;
  due_date: string | null;
  due_raw: string | null;
  status: AssignmentStatus;
  is_completed: boolean;
  scraped_at: string;
  created_at: string;
  updated_at: string;
}

export type AssignmentStatus = 'not_turned_in' | 'turned_in' | 'graded' | 'returned';

export interface AssignmentWithCourse extends Assignment {
  course: {
    classroom_name: string;
    subject: string | null;
  };
}

export interface AssignmentDetail extends AssignmentWithCourse {
  attachments: Attachment[];
}

export interface Attachment {
  id: string;
  assignment_id: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  s3_key: string;
  s3_url: string;
  classroom_url: string | null;
  created_at: string;
}

export interface AssignmentFilters {
  status?: AssignmentStatus;
  subject?: string;
  from?: string;
  to?: string;
  completed?: boolean;
}
