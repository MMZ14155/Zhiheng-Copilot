import { jsonRequest } from './client';
import type { TrackedFileCreateDto, TrackedFileListResponseDto, TrackedFileResponseDto } from './dto';

export const promoteTrackedFile = (id: number, body: TrackedFileCreateDto) => jsonRequest<TrackedFileResponseDto>(`/projects/${id}/tracked-files`, { method: 'POST', body });
export const listTrackedFiles = (id: number) => jsonRequest<TrackedFileListResponseDto>(`/projects/${id}/tracked-files`);
export const switchCurrentVersion = (id: number, version: string) => jsonRequest<TrackedFileResponseDto>(`/tracked-files/${id}/current-version`, { method: 'PATCH', body: { version } });
