export type RiskLevel = "block" | "warn" | "ok";

export interface Project {
  id: string;
  type: string;
  stage: string;
  budget: number;
  cost: number;
  planned: number;
  used: number;
  accept: string;
  quality: number;
  sat: number;
  risk: RiskLevel;
  risks: string[];
  reason: string;
  actions: string[];
}

export interface DocItem {
  name: string;
  version: string;
  status: "ok" | "missing" | "old";
  icon: string;
}

export interface HistoryItem {
  time: string;
  title: string;
  desc: string;
  current?: boolean;
}

export interface DocProject {
  id: string;
  type: string;
  stage: string;
  manager: string;
  risk: RiskLevel;
  riskLabel: string;
  docs: DocItem[];
  history: HistoryItem[];
  aiTip: string;
}

export interface ChatMessage {
  role: "bot" | "user";
  content: string;
  references?: string[];
}
