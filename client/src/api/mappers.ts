import type {
  AverageMetricDto,
  CollectionOverviewDto,
  ProjectDetailResponseDto,
  ProjectDraftOutputDto,
  ProjectFileResponseDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  ProjectRiskBatchItemDto,
  ProjectRiskDto,
  ProjectRisksResponseDto,
  RenewalChainResponseDto,
  SnapshotDetailResponseDto,
  SnapshotRestoreResponseDto,
  SnapshotSummaryDto,
  SnapshotTimelineResponseDto,
  StatisticsOverviewResponseDto,
  TagResponseDto,
  TagSnapshotResponseDto,
  ProjectTagSnapshotItemDto,
  TrackedFileResponseDto,
} from "./dto";
import type {
  AverageMetric,
  CollectionOverview,
  ProjectDetail,
  ProjectDraft,
  ProjectFile,
  ProjectList,
  ProjectListItem,
  ProjectRiskBatchItem,
  ProjectRisks,
  RenewalChain,
  SnapshotDetail,
  SnapshotRestoreResult,
  SnapshotSummary,
  SnapshotTimeline,
  StatisticsOverview,
  Tag,
  TagSnapshot,
  ProjectTagSnapshot,
  TrackedFile,
} from "./models";

export const mapProject = (dto: ProjectResponseDto): ProjectListItem => ({
  id: String(dto.id),
  name: dto.name,
  code: dto.code,
  customerName: dto.customer_name,
  projectType: dto.project_type,
  status: dto.status,
  progress: dto.progress,
  contractAmount: dto.contract_amount,
  signedDate: dto.signed_date,
  plannedDeliveryDate: dto.planned_delivery_date,
  updatedAt: dto.updated_at,
  region: dto.region,
});
export const mapProjectList = (dto: ProjectListResponseDto): ProjectList => ({
  page: dto.page,
  size: dto.size,
  total: dto.total,
  items: dto.items.map(mapProject),
});
export const mapRenewalChain = (
  dto: RenewalChainResponseDto,
): RenewalChain => ({
  projectId: String(dto.project_id),
  depthLimit: dto.depth_limit,
  items: dto.items.map(mapProject),
});
export const mapProjectFile = (dto: ProjectFileResponseDto): ProjectFile => ({
  id: String(dto.id),
  name: dto.name,
  isDeliverable: dto.is_deliverable,
  createdAt: dto.created_at,
  updatedAt: dto.updated_at,
  latestVersion:
    dto.latest_version === null
      ? null
      : {
          version: dto.latest_version.version,
          documentType: dto.latest_version.document_type,
          parseStatus: dto.latest_version.parse_status,
          sizeBytes: dto.latest_version.size_bytes,
          uploadedAt: dto.latest_version.uploaded_at,
          extractPath: dto.latest_version.extract_path ?? null,
        },
});
export const mapTag = (dto: TagResponseDto): Tag => ({
  id: String(dto.id),
  name: dto.name,
  type: dto.type,
  createdBy: dto.created_by,
  note: dto.note,
  createdAt: dto.created_at,
});
export const mapTagSnapshot = (dto: TagSnapshotResponseDto): TagSnapshot => ({
  id: String(dto.id),
  sourceFileId:
    dto.source_file_id === null ? null : String(dto.source_file_id),
  fileVersion: dto.file_version,
  name: dto.name,
  note: dto.note,
  createdAt: dto.created_at,
});
export const mapProjectTagSnapshot = (
  dto: ProjectTagSnapshotItemDto,
): ProjectTagSnapshot => ({
  ...mapTagSnapshot(dto),
  tagName: dto.tag_name,
});
const mapRiskItem = (risk: ProjectRiskDto) => ({
  type: risk.type,
  level: risk.level,
  reason: risk.reason,
  recommendation: risk.recommendation,
  missingParts: risk.missing_parts,
  remainingDays: risk.remaining_days,
  paymentStatus: risk.payment_status,
  dismissed: risk.dismissed,
});
export const mapProjectRisks = (
  dto: ProjectRisksResponseDto,
): ProjectRisks => ({
  level: dto.level,
  risks: dto.risks.map(mapRiskItem),
});
export const mapProjectRiskBatchItem = (
  dto: ProjectRiskBatchItemDto,
): ProjectRiskBatchItem => ({
  projectId: String(dto.project_id),
  level: dto.level,
  risks: dto.risks.map(mapRiskItem),
});
const nullableNumber = (value: string | null) =>
  value === null ? null : Number(value);
export const mapCollectionOverview = (
  dto: CollectionOverviewDto,
): CollectionOverview => ({
  contractAmount: nullableNumber(dto.contract_amount),
  receivableAmount: nullableNumber(dto.receivable_amount),
  receivedAmount: Number(dto.received_amount),
  invoicedAmount: Number(dto.invoiced_amount),
  overdueAmount: nullableNumber(dto.overdue_amount),
  collectionRate: nullableNumber(dto.collection_rate),
  dataStatus: dto.data_status,
  incompleteReasons: dto.incomplete_reasons,
});
const mapAverageMetric = (dto: AverageMetricDto): AverageMetric => ({
  value: dto.value,
  sampleCount: dto.sample_count,
});
export const mapStatisticsOverview = (
  dto: StatisticsOverviewResponseDto,
): StatisticsOverview => ({
  projects: {
    total: dto.projects.total,
    risks: dto.projects.risks,
    averageCostUsageRate: mapAverageMetric(
      dto.projects.average_cost_usage_rate,
    ),
    averageScheduleUsageRate: mapAverageMetric(
      dto.projects.average_schedule_usage_rate,
    ),
    averageSatisfaction: mapAverageMetric(dto.projects.average_satisfaction),
  },
  files: {
    workspaceFileTotal: dto.files.workspace_file_total,
    deliverables: dto.files.deliverables,
  },
  byStage: dto.by_stage.map((item) => ({
    stage: item.stage,
    count: item.count,
    averageCostUsageRate: mapAverageMetric(item.average_cost_usage_rate),
    averageScheduleUsageRate: mapAverageMetric(
      item.average_schedule_usage_rate,
    ),
    averageSatisfaction: mapAverageMetric(item.average_satisfaction),
  })),
  projectTypeDistribution: dto.project_type_distribution,
  deliveryDeadlineDistribution: dto.delivery_deadline_distribution,
  payment: {
    contractAmount: dto.payment.contract_amount,
    invoicedAmount: dto.payment.invoiced_amount,
    receivableAmount: dto.payment.receivable_amount,
    receivedAmount: dto.payment.received_amount,
    outstandingAmount: dto.payment.outstanding_amount,
    overdueAmount: dto.payment.overdue_amount,
    collectionRate: dto.payment.collection_rate,
    dataIncompleteProjects: dto.payment.data_incomplete_projects,
  },
});
export const mapProjectDetail = (
  dto: ProjectDetailResponseDto,
): ProjectDetail => ({
  id: String(dto.id),
  name: dto.name,
  code: dto.code,
  customerName: dto.customer_name,
  projectType: dto.project_type,
  parties: dto.parties.map((party) => ({
    role: party.role,
    name: party.name,
    contact: party.contact,
    contactPerson: party.contact_person ?? null,
    contactInfo: party.contact_info ?? null,
  })),
  contractAmount: dto.contract_amount,
  signedDate: dto.signed_date,
  startedDate: dto.started_date,
  plannedDeliveryDate: dto.planned_delivery_date,
  status: dto.status,
  progress: dto.progress,
  notes: dto.notes,
  region: dto.region,
  deliverables: dto.deliverables.map((item) => ({
    id: String(item.id),
    name: item.name,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  })),
  latestSummary:
    dto.latest_summary === null
      ? null
      : {
          id: String(dto.latest_summary.id),
          content: dto.latest_summary.content,
          createdBy: dto.latest_summary.created_by,
          createdAt: dto.latest_summary.created_at,
          inputs: dto.latest_summary.inputs.map((input) => ({
            trackedFileId:
              input.tracked_file_id === null
                ? null
                : String(input.tracked_file_id),
            trackedFileName: input.tracked_file_name,
            fileVersion: input.file_version,
          })),
        },
  managerIds: dto.manager_ids ?? [],
});

export const mapProjectDraft = (dto: ProjectDraftOutputDto): ProjectDraft => ({
  name: dto.name,
  customerName: dto.customer_name,
  parties: dto.parties.map((party) => ({
    role: party.role,
    name: party.name,
    contact: party.contact,
    contactPerson: party.contact_person ?? null,
    contactInfo: party.contact_info ?? null,
  })),
  contractAmount: dto.contract_amount,
  signedDate: dto.signed_date,
  startedDate: dto.started_date,
  plannedDeliveryDate: dto.planned_delivery_date,
  projectType: dto.project_type,
  paymentTerms: dto.payment_terms ?? [],
  missingFields: dto.missing_fields,
  notes: dto.notes,
  region: dto.region,
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
    extractPath: version.extract_path ?? null,
  })),
  paymentStatus: dto.payment_status,
  receivableAmount: dto.receivable_amount,
  receivedAmount: dto.received_amount,
  paymentDate: dto.payment_date,
  remarks: dto.remarks,
});

export const mapSnapshotSummary = (
  dto: SnapshotSummaryDto,
): SnapshotSummary => ({
  hash: dto.hash,
  parentHash: dto.parent_hash,
  author: dto.author,
  message: dto.message,
  createdAt: dto.created_at,
  entryCount: dto.entry_count,
});
export const mapSnapshotTimeline = (
  dto: SnapshotTimelineResponseDto,
): SnapshotTimeline => ({
  projectId: dto.project_id,
  snapshots: dto.snapshots.map(mapSnapshotSummary),
});
export const mapSnapshotDetail = (
  dto: SnapshotDetailResponseDto,
): SnapshotDetail => ({
  ...mapSnapshotSummary(dto),
  projectId: dto.project_id,
  entries: dto.entries.map((entry) => ({
    fileId: entry.file_id,
    path: entry.path,
    version: entry.version,
    uploader: entry.uploader,
    uploadedAt: entry.uploaded_at,
  })),
});
export const mapSnapshotRestoreResult = (
  dto: SnapshotRestoreResponseDto,
): SnapshotRestoreResult => ({
  snapshot: dto.snapshot,
  restoredFiles: dto.restored_files,
  skipped: dto.skipped.map((item) => ({
    fileId: item.file_id,
    path: item.path,
    reason: item.reason,
  })),
});
