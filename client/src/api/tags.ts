import { jsonRequest } from "./client";
import type {
  ProjectTagSnapshotListResponseDto,
  TagCreateDto,
  TagListResponseDto,
  TagResponseDto,
  TagSnapshotCreateDto,
  TagSnapshotListResponseDto,
  TagSnapshotResponseDto,
} from "./dto";
import { mapProjectTagSnapshot, mapTag, mapTagSnapshot } from "./mappers";
import type { ProjectTagSnapshot, Tag, TagSnapshot } from "./models";

export const createTag = (id: number, body: TagCreateDto) =>
  jsonRequest<TagResponseDto>(`/projects/${id}/tags`, { method: "POST", body });
export const listTags = async (id: number): Promise<Tag[]> =>
  (await jsonRequest<TagListResponseDto>(`/projects/${id}/tags`)).items.map(
    mapTag,
  );
export const createTagSnapshot = (id: number, body: TagSnapshotCreateDto) =>
  jsonRequest<TagSnapshotResponseDto>(`/tags/${id}/snapshots`, {
    method: "POST",
    body,
  });
export const listTagSnapshots = async (id: number): Promise<TagSnapshot[]> =>
  (
    await jsonRequest<TagSnapshotListResponseDto>(`/tags/${id}/snapshots`)
  ).items.map(mapTagSnapshot);
// 项目级批量快照：资料中心使用，避免按标签逐个请求（N+1）。
export const listProjectTagSnapshots = async (
  projectId: number,
): Promise<ProjectTagSnapshot[]> =>
  (
    await jsonRequest<ProjectTagSnapshotListResponseDto>(
      `/projects/${projectId}/tag-snapshots`,
    )
  ).items.map(mapProjectTagSnapshot);
