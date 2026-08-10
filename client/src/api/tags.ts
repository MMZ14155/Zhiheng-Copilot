import { jsonRequest } from './client';
import type { TagCreateDto, TagListResponseDto, TagResponseDto, TagSnapshotCreateDto, TagSnapshotListResponseDto, TagSnapshotResponseDto } from './dto';

export const createTag = (id: number, body: TagCreateDto) => jsonRequest<TagResponseDto>(`/projects/${id}/tags`, { method: 'POST', body });
export const listTags = (id: number) => jsonRequest<TagListResponseDto>(`/projects/${id}/tags`);
export const createTagSnapshot = (id: number, body: TagSnapshotCreateDto) => jsonRequest<TagSnapshotResponseDto>(`/tags/${id}/snapshots`, { method: 'POST', body });
export const listTagSnapshots = (id: number) => jsonRequest<TagSnapshotListResponseDto>(`/tags/${id}/snapshots`);
