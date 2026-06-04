export interface Category {
  id: string;
  name: string;
  requiresAccessCode?: boolean;
}

export interface Question {
  id: string;
  text: string;
  type?: 'multiple_choice' | 'fill_in_the_blank';
  options: string[];
  correctAnswer: number;
  correctAnswerText?: string;
  explanation: string;
}

export interface Quiz {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  session: number | 'all';
  timeLimit: number; // in seconds
  category?: string;
  isActive?: boolean;
  accessCode?: string;
}
