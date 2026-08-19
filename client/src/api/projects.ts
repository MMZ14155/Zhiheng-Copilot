import { jsonRequest, queryString } from './client';
import { mapCollectionOverview, mapProjectDetail, mapProjectList, mapProjectRisks } from './mappers';
import type { CollectionOverviewDto, ProjectDetailResponseDto, ProjectLinkCreateDto, ProjectLinkResponseDto, ProjectListResponseDto, ProjectResponseDto, ProjectRisksResponseDto, ProjectUpdateDto, ProjectWriteDto, RenewalChainResponseDto } from './dto';

export interface ProjectListParams { page?: number; size?: number; company?: string; status?: string; projectType?: string; clientName?: string; expand?: 'links' }
export interface CreateProjectWithRenewalResult { project: ProjectResponseDto; link: ProjectLinkResponseDto | null }

export async function listProjects(params: ProjectListParams = {}) {
  const query = queryString({ page: params.page, size: params.size, company: params.company, status: params.status, project_type: params.projectType, client_name: params.clientName, expand: params.expand });
  return mapProjectList(await jsonRequest<ProjectListResponseDto>(`/projects${query}`));
}
export const createProject = (body: ProjectWriteDto) => jsonRequest<ProjectResponseDto>('/projects', { method: 'POST', body });
export async function createProjectWithRenewal(body: ProjectWriteDto, renewalSourceId?: number | null): Promise<CreateProjectWithRenewalResult> {
  const project = await createProject(body);
  if (!renewalSourceId) return { project, link: null };
  const link = await createProjectLink(renewalSourceId, { target_project_id: project.id, link_type: 'renewal' });
  return { project, link };
}
export const getProject = async (id: number) => mapProjectDetail(await jsonRequest<ProjectDetailResponseDto>(`/projects/${id}`));
export const getProjectRisks = async (id: number | string) => mapProjectRisks(await jsonRequest<ProjectRisksResponseDto>(`/projects/${id}/risks`));
export const getCollectionOverview = async (id: number | string) => mapCollectionOverview(await jsonRequest<CollectionOverviewDto>(`/projects/${id}/collection-overview`));
export const updateProject = (id: number, body: ProjectUpdateDto) => jsonRequest<ProjectResponseDto>(`/projects/${id}`, { method: 'PATCH', body });
export const createProjectLink = (id: number, body: ProjectLinkCreateDto) => jsonRequest<ProjectLinkResponseDto>(`/projects/${id}/links`, { method: 'POST', body });
export const deleteProjectLink = (id: number) => jsonRequest<void>(`/links/${id}`, { method: 'DELETE' });
export const getRenewalChain = (id: number) => jsonRequest<RenewalChainResponseDto>(`/projects/${id}/renewal-chain`);
