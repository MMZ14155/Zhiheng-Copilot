export type RiskLevel = 'block' | 'warn' | 'ok';
export interface ProjectRisk { type: string; level: RiskLevel; reason: string; recommendation: string }
export interface ProjectRisks { level: RiskLevel; risks: ProjectRisk[] }
export interface ProjectListItem { id: string; name: string; code: string; customerName: string; status: 'active' | 'archived' | 'completed'; progress: number; contractAmount: number | null; signedDate: string | null; plannedDeliveryDate: string | null; updatedAt: string; riskLevel?: RiskLevel | null }
export interface ProjectList { page: number; size: number; total: number; items: ProjectListItem[] }
export interface ProjectParty { role: string; name: string; contact: string | null }
export interface ProjectDeliverable { id: string; name: string; createdAt: string; updatedAt: string }
export interface SummaryInput { trackedFileId: string | null; trackedFileName: string | null; fileVersion: string }
export interface ProjectLatestSummary { id: string; content: string | null; createdBy: string | null; createdAt: string; inputs: SummaryInput[] }
export interface FileVersion {
  version: string;
  previousVersion: string | null;
  uploadedBy: string;
  changelog: string;
  parseStatus: string;
  documentType: string | null;
  sizeBytes: number;
  isFrozen: boolean;
  isCurrent: boolean;
  uploadedAt: string;
}
export interface ProjectFile {
  id: number;
  name: string;
  isDeliverable: boolean;
  createdAt: string;
  updatedAt: string;
  latestVersion: {
    version: string;
    documentType: string | null;
    parseStatus: string;
    sizeBytes: number;
    uploadedAt: string;
  } | null;
}
export interface Tag {
  id: number;
  name: string;
  type: 'demo' | 'report' | 'meeting' | 'audit' | 'custom';
  createdBy: string;
  note: string | null;
  createdAt: string;
}
export interface TagSnapshot {
  id: number;
  sourceFileId: number | null;
  fileVersion: string;
  name: string;
  note: string | null;
  createdAt: string;
}
export interface TrackedFile {
  id: string;
  sourceFileId: number | null;
  name: string;
  category: string;
  required: boolean;
  currentVersion: string | null;
  status: string;
  versions: FileVersion[];
}
export interface ProjectDetail {
  id: string;
  name: string;
  code: string;
  customerName: string;
  parties: ProjectParty[];
  contractAmount: number | null;
  signedDate: string | null;
  startedDate: string | null;
  plannedDeliveryDate: string | null;
  status: 'active' | 'archived' | 'completed';
  progress: number;
  notes: string | null;
  deliverables: ProjectDeliverable[];
  latestSummary: ProjectLatestSummary | null;
}
