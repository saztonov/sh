export interface Difficulty {
  id: string;
  subject: string;
  title: string;
  comment: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface DifficultyComment {
  id: string;
  difficulty_id: string;
  text: string;
  created_at: string;
}

export interface DifficultyAttachment {
  id: string;
  difficulty_id: string;
  file_name: string;
  mime_type: string | null;
  size: number | null;
  s3_key: string;
  created_at: string;
}

export interface DifficultyDetail extends Difficulty {
  comments: DifficultyComment[];
  attachments: DifficultyAttachment[];
}
