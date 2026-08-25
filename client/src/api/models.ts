export interface CurrentUser {
  id: number;
  login: string;
  name: string;
  isAdmin: boolean;
}
export type ProjectMemberRole = "manager" | "implementer";
export interface AdminUser {
  id: number;
  login: string;
  name: string;
  isAdmin: boolean;
  createdAt: string;
}
export interface ProjectMember {
  userId: number;
  login: string;
  name: string;
  role: ProjectMemberRole;
}
export interface LlmConfig {
  provider: string;
  baseUrl: string;
  model: string;
  timeoutSeconds: number;
  inputPricePerMtok: string;
  outputPricePerMtok: string;
  apiKeySet: boolean;
  apiKeyMasked: string | null;
  source: "db" | "env" | "default";
}
export interface LlmConfigUpdate {
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutSeconds?: number;
  inputPricePerMtok?: string;
  outputPricePerMtok?: string;
}
export type ProjectType = "软件销售" | "正版化服务" | "正版化服务+软件销售";
export type RiskLevel = "block" | "warn" | "ok";
export interface ProjectRisk {
  type: string;
  level: RiskLevel;
  reason: string;
  recommendation: string;
  remainingDays: number | null;
  overdueDays: number | null;
  overdueAmount: number | null;
  dataStatus: "complete" | "incomplete" | null;
}
export interface ProjectRisks {
  level: RiskLevel;
  risks: ProjectRisk[];
}
export interface CollectionOverview {
  contractAmount: number | null;
  receivableAmount: number | null;
  receivedAmount: number;
  invoicedAmount: number;
  overdueAmount: number | null;
  collectionRate: number | null;
  dataStatus: "ok" | "incomplete";
  incompleteReasons: string[];
}
export type ProjectStage =
  "init" | "planning" | "executing" | "accepting" | "closed";
export interface AverageMetric {
  value: number | null;
  sampleCount: number;
}
export interface StageStatistics {
  stage: ProjectStage | null;
  count: number;
  averageCostUsageRate: AverageMetric;
  averageScheduleUsageRate: AverageMetric;
  averageSatisfaction: AverageMetric;
}
export interface StatisticsOverview {
  projects: {
    total: number;
    risks: Record<RiskLevel, number>;
    averageCostUsageRate: AverageMetric;
    averageScheduleUsageRate: AverageMetric;
    averageSatisfaction: AverageMetric;
  };
  files: {
    workspaceFileTotal: number;
    deliverables: {
      missing: number;
      old: number;
      conflict: number;
      ok: number;
    };
  };
  byStage: StageStatistics[];
  projectTypeDistribution: Record<string, number>;
  deliveryDeadlineDistribution: Record<string, number>;
  payment: {
    contractAmount: number;
    invoicedAmount: number;
    receivableAmount: number;
    receivedAmount: number;
    outstandingAmount: number;
    overdueAmount: number;
    collectionRate: number | null;
    dataIncompleteProjects: number;
  };
}
export interface ProjectListItem {
  id: string;
  name: string;
  code: string;
  customerName: string;
  projectType: ProjectType | null;
  status: "active" | "archived" | "completed";
  progress: number;
  contractAmount: number | null;
  signedDate: string | null;
  plannedDeliveryDate: string | null;
  updatedAt: string;
  riskLevel?: RiskLevel | null;
  risks?: ProjectRisk[];
}
export interface ProjectList {
  page: number;
  size: number;
  total: number;
  items: ProjectListItem[];
}
export interface ProjectParty {
  role: string;
  name: string;
  contact: string | null;
}
export interface ProjectDeliverable {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
export interface SummaryInput {
  trackedFileId: string | null;
  trackedFileName: string | null;
  fileVersion: string;
}
export interface ProjectLatestSummary {
  id: string;
  content: string | null;
  createdBy: string | null;
  createdAt: string;
  inputs: SummaryInput[];
}
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
  type: "demo" | "report" | "meeting" | "audit" | "custom";
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
export interface SnapshotSummary {
  hash: string;
  parentHash: string | null;
  author: string;
  message: string;
  createdAt: string;
  entryCount: number;
}
export interface SnapshotTimeline {
  projectId: number;
  snapshots: SnapshotSummary[];
}
export interface SnapshotEntry {
  fileId: number;
  path: string;
  version: string;
  uploader: string;
  uploadedAt: string;
}
export interface SnapshotDetail extends SnapshotSummary {
  projectId: number;
  entries: SnapshotEntry[];
}
export interface SkippedSnapshotFile {
  fileId: number;
  path: string;
  reason: string;
}
export interface SnapshotRestoreResult {
  snapshot: string;
  restoredFiles: number;
  skipped: SkippedSnapshotFile[];
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
export interface ProjectDraft {
  name: string | null;
  customerName: string | null;
  parties: ProjectParty[];
  contractAmount: string | null;
  signedDate: string | null;
  startedDate: string | null;
  plannedDeliveryDate: string | null;
  projectType: ProjectType | null;
  missingFields: string[];
  notes: string | null;
}
export interface ProjectDetail {
  id: string;
  name: string;
  code: string;
  customerName: string;
  projectType: ProjectType | null;
  parties: ProjectParty[];
  contractAmount: number | null;
  signedDate: string | null;
  startedDate: string | null;
  plannedDeliveryDate: string | null;
  status: "active" | "archived" | "completed";
  progress: number;
  notes: string | null;
  deliverables: ProjectDeliverable[];
  latestSummary: ProjectLatestSummary | null;
}
