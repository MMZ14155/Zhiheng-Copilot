import { jsonRequest, queryString } from "./client";
import {
  mapCollectionOverview,
  mapProjectDetail,
  mapProjectList,
  mapProjectRisks,
  mapProjectRiskBatchItem,
  mapRenewalChain,
} from "./mappers";
import type {
  CollectionOverviewDto,
  ProjectDetailResponseDto,
  ProjectLinkCreateDto,
  ProjectLinkResponseDto,
  ProjectListResponseDto,
  ProjectResponseDto,
  ProjectRiskBatchResponseDto,
  ProjectRisksResponseDto,
  ProjectUpdateDto,
  ProjectWriteDto,
  RenewalChainResponseDto,
} from "./dto";

export interface ProjectListParams {
  page?: number;
  size?: number;
  company?: string;
  status?: string;
  projectType?: string;
  clientName?: string;
  expand?: "links";
  region?: string;
  managerId?: number;
}

export async function listProjects(params: ProjectListParams = {}) {
  const query = queryString({
    page: params.page,
    size: params.size,
    company: params.company,
    status: params.status,
    project_type: params.projectType,
    client_name: params.clientName,
    expand: params.expand,
    region: params.region,
    manager_id: params.managerId,
  });
  return mapProjectList(
    await jsonRequest<ProjectListResponseDto>(`/projects${query}`),
  );
}
export const createProject = (body: ProjectWriteDto) =>
  jsonRequest<ProjectResponseDto>("/projects", { method: "POST", body });
export const getProject = async (id: number) =>
  mapProjectDetail(
    await jsonRequest<ProjectDetailResponseDto>(`/projects/${id}`),
  );
export const getProjectRisks = async (id: number | string) =>
  mapProjectRisks(
    await jsonRequest<ProjectRisksResponseDto>(`/projects/${id}/risks`),
  );
// 批量风险：首页与统计看板使用，避免逐项目请求（N+1）。
export const listProjectRisksBatch = async () =>
  (await jsonRequest<ProjectRiskBatchResponseDto>("/projects/risks")).items.map(
    mapProjectRiskBatchItem,
  );
export const getCollectionOverview = async (id: number | string) =>
  mapCollectionOverview(
    await jsonRequest<CollectionOverviewDto>(
      `/projects/${id}/collection-overview`,
    ),
  );
export const updateProject = (id: number, body: ProjectUpdateDto) =>
  jsonRequest<ProjectResponseDto>(`/projects/${id}`, { method: "PATCH", body });
export const updateProjectNotes = (id: number, notes: string | null) =>
  jsonRequest<ProjectResponseDto>(`/projects/${id}/notes`, {
    method: "PATCH",
    body: { notes },
  });
export const dismissDeliveryWarning = (id: number) =>
  jsonRequest<ProjectResponseDto>(`/projects/${id}/dismiss-delivery-warning`, {
    method: "POST",
  });
export const createProjectLink = (id: number, body: ProjectLinkCreateDto) =>
  jsonRequest<ProjectLinkResponseDto>(`/projects/${id}/links`, {
    method: "POST",
    body,
  });
export const deleteProjectLink = (id: number) =>
  jsonRequest<void>(`/links/${id}`, { method: "DELETE" });
export const getRenewalChain = async (id: number) =>
  mapRenewalChain(
    await jsonRequest<RenewalChainResponseDto>(`/projects/${id}/renewal-chain`),
  );
