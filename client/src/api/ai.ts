import { jsonRequest } from './client';
import type { ContractInfoResponseDto, SummaryHistoryResponseDto, SummaryResponseDto, TaskCreatedResponseDto, TaskResponseDto } from './dto';

export const createSummaryTask = (id: number) => jsonRequest<TaskCreatedResponseDto>(`/projects/${id}/summary`, { method: 'POST' });
export const getLatestSummary = (id: number) => jsonRequest<SummaryResponseDto>(`/projects/${id}/summary`);
export const getSummaryHistory = (id: number) => jsonRequest<SummaryHistoryResponseDto>(`/projects/${id}/summary/history`);
export const createExtractionTask = (version: string) => jsonRequest<TaskCreatedResponseDto>(`/versions/${version}/extract`, { method: 'POST' });
export const getExtraction = (version: string) => jsonRequest<ContractInfoResponseDto>(`/versions/${version}/extract`);
export const getTask = (id: number) => jsonRequest<TaskResponseDto>(`/tasks/${id}`);
