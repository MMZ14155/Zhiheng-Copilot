import { jsonRequest } from "./client";
import type {
  TrackedFileCreateDto,
  TrackedFileListResponseDto,
  TrackedFileResponseDto,
} from "./dto";
import { mapTrackedFile } from "./mappers";
import type { TrackedFile } from "./models";

export const promoteTrackedFile = (id: number, body: TrackedFileCreateDto) =>
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
export const switchCurrentVersion = (id: number, version: string) =>
  jsonRequest<TrackedFileResponseDto>(`/tracked-files/${id}/current-version`, {
    method: "PATCH",
    body: { version },
  });
