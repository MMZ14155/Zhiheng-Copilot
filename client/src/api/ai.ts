import { jsonRequest, multipartRequest } from "./client";
import { mapProjectDraft } from "./mappers";
import type { ProjectDraft } from "./models";
import type {
  CopilotAskRequestDto,
  CopilotAskResponseDto,
  ExtractionInfoResponseDto,
  ProjectDraftTaskResponseDto,
  SummaryAnswersRequestDto,
  SummaryAnswersTaskResponseDto,
  SummaryHistoryResponseDto,
  SummaryResponseDto,
  TaskCreatedResponseDto,
  TaskResponseDto,
} from "./dto";

export const askCopilot = (question: string, projectId?: number) => {
  const body: CopilotAskRequestDto = {
    question,
    ...(projectId === undefined ? {} : { project_id: projectId }),
  };
  return jsonRequest<CopilotAskResponseDto>("/copilot/ask", {
    method: "POST",
    body,
  });
};

export const createSummaryTask = (id: number) =>
  jsonRequest<TaskCreatedResponseDto>(`/projects/${id}/summary`, {
    method: "POST",
  });
export const getLatestSummary = (id: number) =>
  jsonRequest<SummaryResponseDto>(`/projects/${id}/summary`);
export const getSummaryHistory = (id: number) =>
  jsonRequest<SummaryHistoryResponseDto>(`/projects/${id}/summary/history`);
export const submitSummaryAnswers = (
  id: number,
  answers: SummaryAnswersRequestDto["answers"],
) =>
  jsonRequest<SummaryAnswersTaskResponseDto>(
    `/projects/${id}/summary/answers`,
    { method: "POST", body: { answers } },
  );
export const createExtractionTask = (version: string) =>
  jsonRequest<TaskCreatedResponseDto>(`/versions/${version}/extract`, {
    method: "POST",
  });
export const getExtraction = (version: string) =>
  jsonRequest<ExtractionInfoResponseDto>(`/versions/${version}/extract`);
export const getTask = (id: number) =>
  jsonRequest<TaskResponseDto>(`/tasks/${id}`);

export async function analyzeProjectDraft(
  files: File[],
): Promise<TaskCreatedResponseDto> {
  const data = new FormData();
  for (const file of files) {
    data.append("files", file);
  }
  return multipartRequest<TaskCreatedResponseDto>("/ai/project-draft", data);
}

export async function getProjectDraftTask(
  id: number,
): Promise<{
  status: string;
  stage: string | null;
  progress: number | null;
  failureReason: string | null;
  draft: ProjectDraft | null;
}> {
  const dto = await jsonRequest<ProjectDraftTaskResponseDto>(`/ai/project-draft/${id}`);
  return {
    status: dto.status,
    stage: dto.stage,
    progress: dto.progress,
    failureReason: dto.failure_reason,
    draft: dto.draft ? mapProjectDraft(dto.draft) : null,
  };
}

