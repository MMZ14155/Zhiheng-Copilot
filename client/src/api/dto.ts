export type ProjectStatusDto = 'active' | 'archived' | 'completed';
export type ProjectTypeDto = '软件销售' | '正版化服务' | '正版化服务+软件销售';
export type ProjectLinkTypeDto = 'renewal' | 'related';
export type DeliverableCategoryDto = '合同' | '成本明细' | '验收材料' | '检测报告' | '交付成果';
export type TagTypeDto = 'demo' | 'report' | 'meeting' | 'audit' | 'custom';
export type JsonObject = Record<string, unknown>;

export interface CopilotAskRequestDto { question: string; project_id?: number }
export interface CopilotAskResponseDto { answer: string; references: string[] }

// 与后端 UserResponse 对齐：实际字段为 is_admin（布尔），非云端初稿的 role。
export interface UserDto { id: number; login: string; name: string; is_admin: boolean }
export interface LoginResponseDto { token: string; expires_at: string; user: UserDto }

export interface ProjectPartyDto { role: string; name: string; contact: string | null }
export interface ProjectWriteDto { name: string; code: string; customer_name: string; project_type?: ProjectTypeDto | null; parties?: ProjectPartyDto[]; contract_amount?: number | null; signed_date?: string | null; started_date?: string | null; planned_delivery_date?: string | null; status?: ProjectStatusDto; progress?: number; notes?: string | null }
export type ProjectUpdateDto = Partial<ProjectWriteDto>;
export interface ProjectResponseDto { id: number; name: string; code: string; customer_name: string; project_type: ProjectTypeDto | null; parties: ProjectPartyDto[]; contract_amount: number | null; signed_date: string | null; started_date: string | null; planned_delivery_date: string | null; status: ProjectStatusDto; progress: number; notes: string | null; created_at: string; updated_at: string; links: RelatedProjectSummaryDto[] | null }
export interface RelatedProjectSummaryDto { id: number; name: string; code: string; customer_name: string; status: ProjectStatusDto; signed_date: string | null; link_id: number; link_type: ProjectLinkTypeDto }
export interface DeliverableSummaryDto { id: number; name: string; created_at: string; updated_at: string }
export interface SummaryInputDto { tracked_file_id: number | null; tracked_file_name: string | null; file_version: string }
export interface LatestSummaryDto { id: number; version_no: number; content: string | null; created_by: string | null; created_at: string; inputs: SummaryInputDto[] }
export interface ProjectDetailResponseDto extends ProjectResponseDto { deliverables: DeliverableSummaryDto[]; latest_summary: LatestSummaryDto | null }
export interface ProjectListResponseDto { page: number; size: number; total: number; items: ProjectResponseDto[] }
export interface ProjectLinkCreateDto { target_project_id: number; link_type: ProjectLinkTypeDto; note?: string | null }
export interface ProjectLinkResponseDto { id: number; source_project_id: number; target_project_id: number; link_type: ProjectLinkTypeDto; note: string | null; created_at: string }
export interface RenewalChainResponseDto { project_id: number; depth_limit: number; items: ProjectResponseDto[] }
export type RiskLevelDto = 'block' | 'warn' | 'ok';
export interface ProjectRiskDto { type: string; level: RiskLevelDto; reason: string; recommendation: string; remaining_days: number | null; overdue_days: number | null; overdue_amount: number | null; data_status: 'complete' | 'incomplete' | null }
export interface ProjectRisksResponseDto { level: RiskLevelDto; risks: ProjectRiskDto[]; config: JsonObject }
export interface CollectionOverviewDto { contract_amount: string | null; receivable_amount: string | null; received_amount: string; invoiced_amount: string; overdue_amount: string | null; collection_rate: string | null; data_status: 'ok' | 'incomplete'; incomplete_reasons: string[] }

export type ProjectStageDto = 'init' | 'planning' | 'executing' | 'accepting' | 'closed';
export interface AverageMetricDto { value: number | null; sample_count: number }
export interface StageStatisticsDto { stage: ProjectStageDto | null; count: number; average_cost_usage_rate: AverageMetricDto; average_schedule_usage_rate: AverageMetricDto; average_satisfaction: AverageMetricDto }
export interface PaymentStatisticsDto { contract_amount: number; invoiced_amount: number; receivable_amount: number; received_amount: number; outstanding_amount: number; overdue_amount: number; collection_rate: number | null; data_incomplete_projects: number }
export interface StatisticsOverviewResponseDto {
  projects: { total: number; risks: Record<RiskLevelDto, number>; average_cost_usage_rate: AverageMetricDto; average_schedule_usage_rate: AverageMetricDto; average_satisfaction: AverageMetricDto };
  files: { workspace_file_total: number; deliverables: { missing: number; old: number; conflict: number; ok: number } };
  by_stage: StageStatisticsDto[];
  project_type_distribution: Record<string, number>;
  delivery_deadline_distribution: Record<string, number>;
  payment: PaymentStatisticsDto;
}

export interface CreateFileResponseDto { file_id: number; version: string; message: string }
export interface ProjectFileLatestVersionDto { version: string; document_type: string | null; parse_status: string; size_bytes: number; uploaded_at: string }
export interface ProjectFileResponseDto { id: number; name: string; is_deliverable: boolean; created_at: string; updated_at: string; latest_version: ProjectFileLatestVersionDto | null }
export interface ProjectFileListResponseDto { files: ProjectFileResponseDto[] }
export interface FileVersionResponseDto { version: string; file_id: number; prev_version: string | null; storage_path: string; content_hash: string; size_bytes: number; uploaded_by: string; changelog: string; document_type: string | null; parse_status: string; is_frozen: boolean; uploaded_at: string }
export interface VersionListResponseDto { file_id: number; versions: FileVersionResponseDto[] }
export interface TrackedFileCreateDto { source_file_id: number; category: DeliverableCategoryDto; required?: boolean }
export interface TrackedFileResponseDto { id: number; project_id: number; source_file_id: number | null; name: string; category: DeliverableCategoryDto; required: boolean; current_version: string | null; status: 'ok' | 'missing' | 'old' | 'conflict' | 'frozen'; versions: FileVersionResponseDto[]; created_at: string; updated_at: string }
export interface TrackedFileListResponseDto { items: TrackedFileResponseDto[] }
export interface TagCreateDto { name: string; type: TagTypeDto; created_by?: string; note?: string | null }
export interface TagResponseDto { id: number; project_id: number; name: string; type: TagTypeDto; created_by: string; note: string | null; created_at: string }
export interface TagListResponseDto { items: TagResponseDto[] }
export interface TagSnapshotCreateDto { source_file_id: number; version: string; note?: string | null }
export interface TagSnapshotResponseDto { id: number; tag_id: number; source_file_id: number | null; file_version: string; name: string; note: string | null; created_at: string }
export interface TagSnapshotListResponseDto { items: TagSnapshotResponseDto[] }
export interface SnapshotSummaryDto { hash: string; parent_hash: string | null; author: string; message: string; created_at: string; entry_count: number }
export interface SnapshotTimelineResponseDto { project_id: number; snapshots: SnapshotSummaryDto[] }
export interface SnapshotEntryDto { file_id: number; path: string; version: string; uploader: string; uploaded_at: string }
export interface SnapshotDetailResponseDto extends SnapshotSummaryDto { project_id: number; entries: SnapshotEntryDto[] }
export interface SkippedSnapshotFileDto { file_id: number; path: string; reason: string }
export interface SnapshotRestoreResponseDto { snapshot: string; restored_files: number; skipped: SkippedSnapshotFileDto[] }
export interface WorkspaceAddOperationDto { op: 'add'; name: string; content: string; doc_type?: string | null; changelog?: string | null }
export interface WorkspaceUpdateOperationDto { op: 'update'; file_id: number; content: string; changelog?: string | null }
export interface WorkspaceRemoveOperationDto { op: 'remove'; file_id: number }
export interface WorkspaceCommitRequestDto { message: string; operations: Array<WorkspaceAddOperationDto | WorkspaceUpdateOperationDto | WorkspaceRemoveOperationDto> }
export interface WorkspaceCommitResponseDto { snapshot: string; message: string }
export interface TaskCreatedResponseDto { task_id: number; status: 'pending' }
export interface SummaryAnswerDto { question: string; answer: string }
export interface SummaryAnswersRequestDto { answers: SummaryAnswerDto[] }
export interface SummaryAnswersTaskResponseDto { task_id: number; accepted_questions: string[]; ignored_questions: string[] }
export interface TaskResponseDto { id: number; project_id: number | null; task_type: string; status: string; payload: JsonObject; failure_reason: string | null; started_at: string | null; finished_at: string | null; created_at: string; updated_at: string; llm_usage: { call_count: number; input_tokens: number; output_tokens: number; cost: number } }
export interface SummaryResponseDto { id: number; project_id: number; version_no: number; core_info: JsonObject; contract_invoice_progress: JsonObject; missing_materials: Array<Record<string, string>>; pending_questions: string[]; content: string | null; created_by: string | null; created_at: string; inputs: SummaryInputDto[] }
export interface SummaryHistoryResponseDto { items: SummaryResponseDto[] }
export interface ContractInfoResponseDto { type: 'contract'; id: number; version: string; contract_no: string | null; party_a: string | null; party_b: string | null; amount: number | null; signed_date: string | null; payment_terms: Array<Record<string, string>>; missing_fields: string[]; raw_output: JsonObject; created_at: string }
export interface InvoiceInfoResponseDto { type: 'invoice'; id: number; version: string; invoice_no: string | null; issued_date: string | null; amount: number | null; tax_amount: number | null; tax_rate: number | null; buyer: string | null; seller: string | null; missing_fields: string[]; raw_output: JsonObject; created_at: string }
export interface PaymentInfoResponseDto { type: 'payment'; id: number; version: string; amount: number | null; payment_date: string | null; payer: string | null; contract_no: string | null; remarks: string | null; missing_fields: string[]; raw_output: JsonObject; created_at: string }
export type ExtractionInfoResponseDto = ContractInfoResponseDto | InvoiceInfoResponseDto | PaymentInfoResponseDto;
