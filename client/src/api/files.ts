import { jsonRequest, multipartRequest, queryString } from './client';
import type { CreateFileResponseDto, VersionListResponseDto } from './dto';

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
export const getVersionDownloadUrl = (version: string) => `/api/v1/versions/${encodeURIComponent(version)}/download`;
