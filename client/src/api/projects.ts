import { jsonRequest, queryString } from './client';
import { mapProjectList } from './mappers';
import type { ProjectDetailResponseDto, ProjectLinkCreateDto, ProjectLinkResponseDto, ProjectListResponseDto, ProjectResponseDto, ProjectUpdateDto, ProjectWriteDto, RenewalChainResponseDto } from './dto';

export interface ProjectListParams { page?: number; size?: number; company?: string; status?: string; clientName?: string; expand?: 'links' }

export async function listProjects(params: ProjectListParams = {}) {
  const query = queryString({ page: params.page, size: params.size, company: params.company, status: params.status, client_name: params.clientName, expand: params.expand });
  return mapProjectList(await jsonRequest<ProjectListResponseDto>(`/projects${query}`));
}
export const createProject = (body: ProjectWriteDto) => jsonRequest<ProjectResponseDto>('/projects', { method: 'POST', body });
export const getProject = (id: number) => jsonRequest<ProjectDetailResponseDto>(`/projects/${id}`);
export const updateProject = (id: number, body: ProjectUpdateDto) => jsonRequest<ProjectResponseDto>(`/projects/${id}`, { method: 'PATCH', body });
export const createProjectLink = (id: number, body: ProjectLinkCreateDto) => jsonRequest<ProjectLinkResponseDto>(`/projects/${id}/links`, { method: 'POST', body });
export const deleteProjectLink = (id: number) => jsonRequest<void>(`/links/${id}`, { method: 'DELETE' });
export const getRenewalChain = (id: number) => jsonRequest<RenewalChainResponseDto>(`/projects/${id}/renewal-chain`);
