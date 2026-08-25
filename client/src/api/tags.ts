import { jsonRequest } from "./client";
import type {
  TagCreateDto,
  TagListResponseDto,
  TagResponseDto,
  TagSnapshotCreateDto,
  TagSnapshotListResponseDto,
  TagSnapshotResponseDto,
} from "./dto";
import type { Tag, TagSnapshot } from "./models";

export const createTag = (id: number, body: TagCreateDto) =>
  jsonRequest<TagResponseDto>(`/projects/${id}/tags`, { method: "POST", body });
export const listTags = async (id: number): Promise<Tag[]> =>
  (await jsonRequest<TagListResponseDto>(`/projects/${id}/tags`)).items.map(
    (item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      createdBy: item.created_by,
      note: item.note,
      createdAt: item.created_at,
    }),
  );
export const createTagSnapshot = (id: number, body: TagSnapshotCreateDto) =>
  jsonRequest<TagSnapshotResponseDto>(`/tags/${id}/snapshots`, {
    method: "POST",
    body,
  });
export const listTagSnapshots = async (id: number): Promise<TagSnapshot[]> =>
  (
    await jsonRequest<TagSnapshotListResponseDto>(`/tags/${id}/snapshots`)
  ).items.map((item) => ({
    id: item.id,
    sourceFileId: item.source_file_id,
    fileVersion: item.file_version,
    name: item.name,
    note: item.note,
    createdAt: item.created_at,
  }));
