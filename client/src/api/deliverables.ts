import { jsonRequest } from "./client";
import type {
  TrackedFileCreateDto,
  TrackedFileListResponseDto,
  TrackedFileResponseDto,
  TrackedFileUpdateDto,
} from "./dto";
import { mapTrackedFile } from "./mappers";
import type { TrackedFile } from "./models";

export const createTrackedFile = (id: number, body: TrackedFileCreateDto) =>
  jsonRequest<TrackedFileResponseDto>(`/projects/${id}/tracked-files`, {
    method: "POST",
    body,
  });

export const listTrackedFiles = async (id: number): Promise<TrackedFile[]> => {
  const response = await jsonRequest<TrackedFileListResponseDto>(
    `/projects/${id}/tracked-files`,
  );
  return response.items.map(mapTrackedFile);
};

export const updateTrackedFile = (id: number, body: TrackedFileUpdateDto) =>
  jsonRequest<TrackedFileResponseDto>(`/tracked-files/${id}`, {
    method: "PATCH",
    body,
  });

export const deleteTrackedFile = (id: number) =>
  jsonRequest<void>(`/tracked-files/${id}`, { method: "DELETE" });
