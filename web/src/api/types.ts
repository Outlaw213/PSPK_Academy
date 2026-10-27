// Response shapes from docs/api.md, written by hand for the endpoints the panel uses.
// Statuses and labels are always computed by the backend (R11); the panel only shows them.

export type Role = "PARTICIPANT" | "INSTRUCTOR" | "ADMIN";

export type TaskStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "SUBMITTED" | "UNDER_REVIEW" | "NEEDS_IMPROVEMENT" | "PASSED";

export type SubmissionStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "NEEDS_IMPROVEMENT" | "PASSED" | "CANCELLED";

export type TaskType = "PRACTICAL" | "THEORY" | "QUIZ" | "COURSE";

export type UserStatus = "PENDING_APPROVAL" | "ACTIVE" | "REJECTED" | "DEACTIVATED";

export interface Tokens {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  roles: Role[];
  created_at: string;
}

export interface PathRef {
  id: string;
  name: string;
  version: number;
}

export interface Progress {
  completed: number;
  total: number;
}

export interface MyPath {
  id: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  path_version_id: string;
  path: PathRef;
  enrolled_at: string;
  completed_at: string | null;
  progress: Progress;
}

export interface TaskItem {
  id: string;
  label: string;
  name: string;
  task_type: TaskType;
  position: number;
  status: TaskStatus;
}

export interface StageProgress {
  id: string;
  name: string;
  position: number;
  gate_open: boolean;
  tasks: TaskItem[];
}

export interface PathProgress {
  path: PathRef;
  enrollment_status: MyPath["status"];
  progress: Progress;
  stages: StageProgress[];
}

export interface VideoLink {
  id: string;
  position: number;
  title: string;
  url: string;
}

export interface Material {
  id: string;
  position: number;
  caption: string | null;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
}

export interface Attachment {
  id: string;
  position: number;
  title: string;
  file_size: number;
}

export interface PublicQuestion {
  id: string;
  position: number;
  text: string;
  kind: "SINGLE" | "MULTI";
  options: { id: string; position: number; text: string }[];
}

export interface Revision {
  id: string;
  revision_number: number;
  name: string;
  task_type: TaskType;
  description: string | null;
  instructions: string | null;
  content_md: string | null;
  assignment: string | null;
  evaluation_criteria: string | null;
  submission_requirements: string | null;
  material: string | null;
  quantity_description: string | null;
  expected_duration_days: number | null;
  estimated_minutes: number | null;
  difficulty: number | null;
  pass_threshold: number | null;
  questions: PublicQuestion[];
  video_links: VideoLink[];
  materials: Material[];
  attachments: Attachment[];
}

export interface TaskDetail {
  id: string;
  label: string;
  stage: { id: string; name: string; position: number };
  status: TaskStatus;
  revision: Revision;
}

export interface Photo {
  id: string;
  position: number;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
}

export interface Assessment {
  result: "PASSED" | "NEEDS_IMPROVEMENT";
  comment: string | null;
  score: number | null;
  instructor: { first_name: string; last_name: string } | null; // null = graded automatically (quiz)
  created_at: string;
}

export interface Submission {
  id: string;
  task_id: string;
  attempt_number: number;
  status: SubmissionStatus;
  comment: string | null;
  task_revision_id: string | null;
  submitted_at: string | null;
  claimed_at: string | null;
  assessed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  photos: Photo[];
  assessment: Assessment | null;
}

export interface SubmissionDetail extends Submission {
  revision: Revision | null;
}

export interface MySubmission {
  submission: Submission;
  task: { id: string; label: string | null; name: string; task_type: TaskType };
  stage: { id: string; name: string; position: number };
  path: PathRef;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface QuizResult {
  submission: Submission;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  review: { question_id: string; option_ids: string[]; correct_option_ids: string[] }[] | null;
}
