import type { ProjectDetailResponseDto, ProjectListResponseDto, ProjectResponseDto } from './dto';
import type { ProjectDetail, ProjectList, ProjectListItem } from './models';

export const mapProject = (dto: ProjectResponseDto): ProjectListItem => ({ id: String(dto.id), name: dto.name, code: dto.code, customerName: dto.customer_name, status: dto.status, progress: dto.progress, contractAmount: dto.contract_amount, signedDate: dto.signed_date, plannedDeliveryDate: dto.planned_delivery_date, updatedAt: dto.updated_at });
export const mapProjectList = (dto: ProjectListResponseDto): ProjectList => ({ page: dto.page, size: dto.size, total: dto.total, items: dto.items.map(mapProject) });
export const mapProjectDetail = (dto: ProjectDetailResponseDto): ProjectDetail => ({
  id: String(dto.id),
  name: dto.name,
  code: dto.code,
  customerName: dto.customer_name,
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
    versionNo: dto.latest_summary.version_no,
    content: dto.latest_summary.content,
    createdBy: dto.latest_summary.created_by,
    createdAt: dto.latest_summary.created_at,
  },
});
