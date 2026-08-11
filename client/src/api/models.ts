export interface ProjectListItem { id: string; name: string; code: string; customerName: string; status: 'active' | 'archived' | 'completed'; progress: number; contractAmount: number | null; signedDate: string | null; plannedDeliveryDate: string | null; updatedAt: string }
export interface ProjectList { page: number; size: number; total: number; items: ProjectListItem[] }
export interface ProjectParty { role: string; name: string; contact: string | null }
export interface ProjectDeliverable { id: string; name: string; createdAt: string; updatedAt: string }
export interface ProjectLatestSummary { id: string; versionNo: number; content: string | null; createdBy: string | null; createdAt: string }
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
