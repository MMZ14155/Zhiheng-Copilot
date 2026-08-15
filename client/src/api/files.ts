import { jsonRequest, multipartRequest, queryString } from './client';
import type { CreateFileResponseDto, ProjectFileListResponseDto, VersionListResponseDto } from './dto';
import type { ProjectFile } from './models';

export interface FileUpload { file: File; uploadedBy: string; changelog?: string }
export interface CreateFileUpload extends FileUpload { name: string; docType?: string }

export function createFile(projectId: number, input: CreateFileUpload): Promise<CreateFileResponseDto> {
  const data = new FormData();
  data.append('file', input.file);
  return multipartRequest(`/projects/${projectId}/files${queryString({ name: input.name, uploaded_by: input.uploadedBy, changelog: input.changelog, doc_type: input.docType })}`, data);
}
export function appendFileVersion(fileId: number, input: FileUpload): Promise<CreateFileResponseDto> {
  const data = new FormData();
  data.append('file', input.file);
  return multipartRequest(`/files/${fileId}/versions${queryString({ uploaded_by: input.uploadedBy, changelog: input.changelog })}`, data);
}
export const listFileVersions = (id: number) => jsonRequest<VersionListResponseDto>(`/files/${id}/versions`);
export const listFileVersionOptions = async (id: number): Promise<string[]> => (await listFileVersions(id)).versions.map((item) => item.version);
export async function listProjectFiles(projectId: number): Promise<ProjectFile[]> {
  const response = await jsonRequest<ProjectFileListResponseDto>(`/projects/${projectId}/files`);
  return response.files.map((item) => ({
    id: item.id,
    name: item.name,
    isDeliverable: item.is_deliverable,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    latestVersion: item.latest_version === null ? null : {
      version: item.latest_version.version,
      documentType: item.latest_version.document_type,
      parseStatus: item.latest_version.parse_status,
      sizeBytes: item.latest_version.size_bytes,
      uploadedAt: item.latest_version.uploaded_at,
    },
  }));
}
export const getVersionDownloadUrl = (version: string) => `/api/v1/versions/${encodeURIComponent(version)}/download`;
