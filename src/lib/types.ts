export const SUBJECTS = ["Bangla", "English", "Math", "GK"] as const;
export type Subject = (typeof SUBJECTS)[number];

export type GeneratedQuestion = {
  subject: Subject;
  subTopic: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type PublicQuestion = {
  id: number;
  idx: number;
  subject: string;
  subTopic: string;
  question: string;
  options: string[];
};

export type PublicPlayer = {
  id: number;
  name: string;
  submitted: boolean;
  answeredCount: number;
};

export type ExamState = {
  code: string;
  title: string;
  status: "lobby" | "running" | "finished";
  source: string;
  questionCount: number;
  durationMin: number;
  negativeMark: number;
  hostName: string | null;
  startedAt: string | null;
  endsAt: string | null;
  serverNow: string;
  players: PublicPlayer[];
  questions: PublicQuestion[] | null;
  me: { id: number; name: string; answers: Record<string, number>; submitted: boolean } | null;
};

export type SubjectStat = {
  subject: string;
  correct: number;
  wrong: number;
  skipped: number;
  total: number;
  accuracy: number; // 0-100
  label: string;
};

export type TopicStat = {
  subject: string;
  subTopic: string;
  correct: number;
  total: number;
  accuracy: number;
};

export type PlayerResult = {
  id: number;
  name: string;
  answers: Record<string, number>;
  score: number;
  correct: number;
  wrong: number;
  skipped: number;
  rank: number;
  subjects: SubjectStat[];
  topics: TopicStat[];
  weakSubjects: { subject: string; accuracy: number; topics: string[] }[];
  history: {
    exams: number;
    subjects: { subject: string; accuracy: number; total: number; flagged: boolean }[];
  };
};

export type ReviewQuestion = PublicQuestion & {
  correctIndex: number;
  explanation: string;
};

export type ExamResults = {
  code: string;
  title: string;
  negativeMark: number;
  questionCount: number;
  source: string;
  questions: ReviewQuestion[];
  players: PlayerResult[];
};
