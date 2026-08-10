import type { ProjectListResponseDto, ProjectResponseDto } from './dto';
import type { ProjectList, ProjectListItem } from './models';

export const mapProject = (dto: ProjectResponseDto): ProjectListItem => ({ id: String(dto.id), name: dto.name, code: dto.code, customerName: dto.customer_name, status: dto.status, progress: dto.progress, contractAmount: dto.contract_amount, signedDate: dto.signed_date, plannedDeliveryDate: dto.planned_delivery_date, updatedAt: dto.updated_at });
export const mapProjectList = (dto: ProjectListResponseDto): ProjectList => ({ page: dto.page, size: dto.size, total: dto.total, items: dto.items.map(mapProject) });
