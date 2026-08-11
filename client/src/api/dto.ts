export type ProjectStatusDto = 'active' | 'archived' | 'completed';
export type ProjectLinkTypeDto = 'renewal' | 'related';
export type DeliverableCategoryDto = '合同' | '成本明细' | '验收材料' | '检测报告' | '交付成果';
export type TagTypeDto = 'demo' | 'report' | 'meeting' | 'audit' | 'custom';
export type JsonObject = Record<string, unknown>;

export interface ProjectPartyDto { role: string; name: string; contact: string | null }
export interface ProjectWriteDto { name: string; code: string; customer_name: string; parties?: ProjectPartyDto[]; contract_amount?: number | null; signed_date?: string | null; started_date?: string | null; planned_delivery_date?: string | null; status?: ProjectStatusDto; progress?: number; notes?: string | null }
export type ProjectUpdateDto = Partial<ProjectWriteDto>;
export interface ProjectResponseDto { id: number; name: string; code: string; customer_name: string; parties: ProjectPartyDto[]; contract_amount: number | null; signed_date: string | null; started_date: string | null; planned_delivery_date: string | null; status: ProjectStatusDto; progress: number; notes: string | null; created_at: string; updated_at: string; links: RelatedProjectSummaryDto[] | null }
export interface RelatedProjectSummaryDto { id: number; name: string; code: string; customer_name: string; status: ProjectStatusDto; signed_date: string | null; link_id: number; link_type: ProjectLinkTypeDto }
export interface DeliverableSummaryDto { id: number; name: string; created_at: string; updated_at: string }
export interface LatestSummaryDto { id: number; version_no: number; content: string | null; created_by: string | null; created_at: string }
export interface ProjectDetailResponseDto extends ProjectResponseDto { deliverables: DeliverableSummaryDto[]; latest_summary: LatestSummaryDto | null }
export interface ProjectListResponseDto { page: number; size: number; total: number; items: ProjectResponseDto[] }
export interface ProjectLinkCreateDto { target_project_id: number; link_type: ProjectLinkTypeDto; note?: string | null }
export interface ProjectLinkResponseDto { id: number; source_project_id: number; target_project_id: number; link_type: ProjectLinkTypeDto; note: string | null; created_at: string }
export interface RenewalChainResponseDto { project_id: number; depth_limit: number; items: ProjectResponseDto[] }

export interface CreateFileResponseDto { file_id: number; version: string; message: string }
export interface FileVersionResponseDto { version: string; file_id: number; prev_version: string | null; storage_path: string; content_hash: string; size_bytes: number; uploaded_by: string; changelog: string; document_type: string | null; parse_status: string; is_frozen: boolean; uploaded_at: string }
export interface VersionListResponseDto { file_id: number; versions: FileVersionResponseDto[] }
export interface TrackedFileCreateDto { source_file_id: number; category: DeliverableCategoryDto; required?: boolean }
export interface TrackedFileResponseDto { id: number; project_id: number; source_file_id: number | null; name: string; category: DeliverableCategoryDto; required: boolean; current_version: string | null; status: 'ok' | 'missing' | 'old' | 'conflict' | 'frozen'; versions: FileVersionResponseDto[]; created_at: string; updated_at: string }
export interface TrackedFileListResponseDto { items: TrackedFileResponseDto[] }
export interface TagCreateDto { name: string; type: TagTypeDto; created_by: string; note?: string | null }
export interface TagResponseDto { id: number; project_id: number; name: string; type: TagTypeDto; created_by: string; note: string | null; created_at: string }
export interface TagListResponseDto { items: TagResponseDto[] }
export interface TagSnapshotCreateDto { source_file_id: number; version: string; note?: string | null }
export interface TagSnapshotResponseDto { id: number; tag_id: number; source_file_id: number | null; file_version: string; name: string; note: string | null; created_at: string }
export interface TagSnapshotListResponseDto { items: TagSnapshotResponseDto[] }
export interface TaskCreatedResponseDto { task_id: number; status: 'pending' }
export interface SummaryAnswerDto { question: string; answer: string }
export interface SummaryAnswersRequestDto { answers: SummaryAnswerDto[] }
export interface SummaryAnswersTaskResponseDto { task_id: number; accepted_questions: string[]; ignored_questions: string[] }
export interface TaskResponseDto { id: number; project_id: number | null; task_type: string; status: string; payload: JsonObject; failure_reason: string | null; started_at: string | null; finished_at: string | null; created_at: string; updated_at: string; llm_usage: { call_count: number; input_tokens: number; output_tokens: number; cost: number } }
export interface SummaryResponseDto { id: number; project_id: number; version_no: number; core_info: JsonObject; contract_invoice_progress: JsonObject; missing_materials: Array<Record<string, string>>; pending_questions: string[]; content: string | null; created_by: string | null; created_at: string }
export interface SummaryHistoryResponseDto { items: SummaryResponseDto[] }
export interface ContractInfoResponseDto { id: number; version: string; contract_no: string | null; party_a: string | null; party_b: string | null; amount: number | null; signed_date: string | null; payment_terms: Array<Record<string, string>>; missing_fields: string[]; raw_output: JsonObject; created_at: string }
