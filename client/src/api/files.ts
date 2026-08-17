import { blobRequest, jsonRequest, multipartRequest, queryString } from './client';
import type { CreateFileResponseDto, ProjectFileListResponseDto, VersionListResponseDto, WorkspaceCommitResponseDto } from './dto';
import type { ProjectFile } from './models';

export interface FileUpload { file: File; changelog?: string }
export interface CreateFileUpload extends FileUpload { name: string; docType?: string }
export type WorkspaceOperation = { op: 'add'; name: string; file: File; docType?: string; changelog?: string } | { op: 'update'; fileId: number; file: File; changelog?: string } | { op: 'remove'; fileId: number };
export interface WorkspaceCommitInput { message: string; operations: WorkspaceOperation[] }

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = (event) => reject(new Error(event?.target?.error?.message ?? '文件读取失败'));
  reader.readAsDataURL(file);
});

// 上传人由服务端根据当前登录用户写入，客户端不再传 uploaded_by。
export function createFile(projectId: number, input: CreateFileUpload): Promise<CreateFileResponseDto> {
  const data = new FormData();
  data.append('file', input.file);
  return multipartRequest(`/projects/${projectId}/files${queryString({ name: input.name, changelog: input.changelog, doc_type: input.docType })}`, data);
}
export function appendFileVersion(fileId: number, input: FileUpload): Promise<CreateFileResponseDto> {
  const data = new FormData();
  data.append('file', input.file);
  return multipartRequest(`/files/${fileId}/versions${queryString({ changelog: input.changelog })}`, data);
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
export async function downloadVersion(version: string): Promise<{ blob: Blob; filename: string }> {
  const { blob, headers } = await blobRequest(`/versions/${encodeURIComponent(version)}/download`);
  const header = headers.get('content-disposition') ?? '';
  const match = /filename\*?=UTF-8''([^;]+)/i.exec(header) ?? /filename="?([^";]+)"?/i.exec(header);
  const filename = match ? decodeURIComponent(match[1]) : `${version.slice(0, 8)}`;
  return { blob, filename };
}

export async function workspaceCommit(projectId: number, input: WorkspaceCommitInput): Promise<WorkspaceCommitResponseDto> {
  const operations: Array<{ op: 'add'; name: string; content: string; doc_type?: string; changelog?: string } | { op: 'update'; file_id: number; content: string; changelog?: string } | { op: 'remove'; file_id: number }> = [];
  for (const op of input.operations) {
    if (op.op === 'add') {
      operations.push({ op: 'add', name: op.name, content: await fileToBase64(op.file), doc_type: op.docType, changelog: op.changelog });
    } else if (op.op === 'update') {
      operations.push({ op: 'update', file_id: op.fileId, content: await fileToBase64(op.file), changelog: op.changelog });
    } else if (op.op === 'remove') {
      operations.push({ op: 'remove', file_id: op.fileId });
    }
  }
  return jsonRequest<WorkspaceCommitResponseDto>(`/projects/${projectId}/workspace-commit`, { method: 'POST', body: { message: input.message, operations } });
}
