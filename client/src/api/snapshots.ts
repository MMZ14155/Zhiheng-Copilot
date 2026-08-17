import { jsonRequest } from './client';
import type { SnapshotDetailResponseDto, SnapshotRestoreResponseDto, SnapshotTimelineResponseDto } from './dto';
import { mapSnapshotDetail, mapSnapshotRestoreResult, mapSnapshotTimeline } from './mappers';
import type { SnapshotDetail, SnapshotRestoreResult, SnapshotTimeline } from './models';

export const listSnapshots = async (projectId: number): Promise<SnapshotTimeline> => mapSnapshotTimeline(await jsonRequest<SnapshotTimelineResponseDto>(`/projects/${projectId}/snapshots`));
export const getSnapshot = async (hash: string): Promise<SnapshotDetail> => mapSnapshotDetail(await jsonRequest<SnapshotDetailResponseDto>(`/snapshots/${hash}`));
export const restoreSnapshot = async (hash: string): Promise<SnapshotRestoreResult> => mapSnapshotRestoreResult(await jsonRequest<SnapshotRestoreResponseDto>(`/snapshots/${hash}/restore`, { method: 'POST' }));
