import type { AverageMetricDto, ProjectDetailResponseDto, ProjectListResponseDto, ProjectResponseDto, ProjectRisksResponseDto, StatisticsOverviewResponseDto, TrackedFileResponseDto } from './dto';
import type { AverageMetric, ProjectDetail, ProjectList, ProjectListItem, ProjectRisks, StatisticsOverview, TrackedFile } from './models';

export const mapProject = (dto: ProjectResponseDto): ProjectListItem => ({ id: String(dto.id), name: dto.name, code: dto.code, customerName: dto.customer_name, projectType: dto.project_type, status: dto.status, progress: dto.progress, contractAmount: dto.contract_amount, signedDate: dto.signed_date, plannedDeliveryDate: dto.planned_delivery_date, updatedAt: dto.updated_at });
export const mapProjectList = (dto: ProjectListResponseDto): ProjectList => ({ page: dto.page, size: dto.size, total: dto.total, items: dto.items.map(mapProject) });
export const mapProjectRisks = (dto: ProjectRisksResponseDto): ProjectRisks => ({
  level: dto.level,
  risks: dto.risks.map((risk) => ({
    type: risk.type,
    level: risk.level,
    reason: risk.reason,
    recommendation: risk.recommendation,
  })),
});
const mapAverageMetric = (dto: AverageMetricDto): AverageMetric => ({ value: dto.value, sampleCount: dto.sample_count });
export const mapStatisticsOverview = (dto: StatisticsOverviewResponseDto): StatisticsOverview => ({
  projects: {
    total: dto.projects.total,
    risks: dto.projects.risks,
    averageCostUsageRate: mapAverageMetric(dto.projects.average_cost_usage_rate),
    averageScheduleUsageRate: mapAverageMetric(dto.projects.average_schedule_usage_rate),
    averageSatisfaction: mapAverageMetric(dto.projects.average_satisfaction),
  },
  files: { workspaceFileTotal: dto.files.workspace_file_total, deliverables: dto.files.deliverables },
  byStage: dto.by_stage.map((item) => ({
    stage: item.stage,
    count: item.count,
    averageCostUsageRate: mapAverageMetric(item.average_cost_usage_rate),
    averageScheduleUsageRate: mapAverageMetric(item.average_schedule_usage_rate),
    averageSatisfaction: mapAverageMetric(item.average_satisfaction),
  })),
});
export const mapProjectDetail = (dto: ProjectDetailResponseDto): ProjectDetail => ({
  id: String(dto.id),
  name: dto.name,
  code: dto.code,
  customerName: dto.customer_name,
  projectType: dto.project_type,
  parties: dto.parties.map((party) => ({ role: party.role, name: party.name, contact: party.contact })),
  contractAmount: dto.contract_amount,
  signedDate: dto.signed_date,
  startedDate: dto.started_date,
  plannedDeliveryDate: dto.planned_delivery_date,
  status: dto.status,
  progress: dto.progress,
  notes: dto.notes,
  deliverables: dto.deliverables.map((item) => ({ id: String(item.id), name: item.name, createdAt: item.created_at, updatedAt: item.updated_at })),
  latestSummary: dto.latest_summary === null ? null : {
    id: String(dto.latest_summary.id),
    content: dto.latest_summary.content,
    createdBy: dto.latest_summary.created_by,
    createdAt: dto.latest_summary.created_at,
    inputs: dto.latest_summary.inputs.map((input) => ({
      trackedFileId: input.tracked_file_id === null ? null : String(input.tracked_file_id),
      trackedFileName: input.tracked_file_name,
      fileVersion: input.file_version,
    })),
  },
});

export const mapTrackedFile = (dto: TrackedFileResponseDto): TrackedFile => ({
  id: String(dto.id),
  sourceFileId: dto.source_file_id,
  name: dto.name,
  category: dto.category,
  required: dto.required,
  currentVersion: dto.current_version,
  status: dto.status,
  versions: dto.versions.map((version) => ({
    version: version.version,
    previousVersion: version.prev_version,
    uploadedBy: version.uploaded_by,
    changelog: version.changelog,
    parseStatus: version.parse_status,
    documentType: version.document_type,
    sizeBytes: version.size_bytes,
    isFrozen: version.is_frozen,
    isCurrent: version.version === dto.current_version,
    uploadedAt: version.uploaded_at,
  })),
});
