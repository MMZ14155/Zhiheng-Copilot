import { jsonRequest } from "./client";
import type {
  AdminUserCreateDto,
  AdminUserDto,
  LlmConfigResponseDto,
  LlmConfigUpdateDto,
  ProjectMemberAssignDto,
  ProjectMemberDto,
} from "./dto";
import type {
  AdminUser,
  LlmConfig,
  LlmConfigUpdate,
  ProjectMember,
} from "./models";

const mapUser = (user: AdminUserDto): AdminUser => ({
  id: user.id,
  login: user.login,
  name: user.name,
  isAdmin: user.is_admin,
  createdAt: user.created_at,
});

const mapMember = (member: ProjectMemberDto): ProjectMember => ({
  userId: member.user_id,
  login: member.login,
  name: member.name,
  role: member.role,
});

const mapLlmConfig = (config: LlmConfigResponseDto): LlmConfig => ({
  provider: config.provider,
  baseUrl: config.base_url,
  model: config.model,
  timeoutSeconds: config.timeout_seconds,
  inputPricePerMtok: String(config.input_price_per_mtok),
  outputPricePerMtok: String(config.output_price_per_mtok),
  apiKeySet: config.api_key_set,
  apiKeyMasked: config.api_key_masked,
  source: config.source,
});
const toLlmConfigDto = (config: LlmConfigUpdate): LlmConfigUpdateDto => ({
  ...(config.provider !== undefined ? { provider: config.provider } : {}),
  ...(config.apiKey !== undefined ? { api_key: config.apiKey } : {}),
  ...(config.baseUrl !== undefined ? { base_url: config.baseUrl } : {}),
  ...(config.model !== undefined ? { model: config.model } : {}),
  ...(config.timeoutSeconds !== undefined
    ? { timeout_seconds: config.timeoutSeconds }
    : {}),
  ...(config.inputPricePerMtok !== undefined
    ? { input_price_per_mtok: config.inputPricePerMtok }
    : {}),
  ...(config.outputPricePerMtok !== undefined
    ? { output_price_per_mtok: config.outputPricePerMtok }
    : {}),
});

export async function listUsers() {
  return (await jsonRequest<AdminUserDto[]>("/admin/users")).map(mapUser);
}

export async function createUser(body: AdminUserCreateDto) {
  return mapUser(
    await jsonRequest<AdminUserDto>("/admin/users", { method: "POST", body }),
  );
}

export function deleteUser(id: number) {
  return jsonRequest<void>(`/admin/users/${id}`, { method: "DELETE" });
}

export async function listProjectMembers(projectId: number) {
  return (
    await jsonRequest<ProjectMemberDto[]>(
      `/admin/projects/${projectId}/members`,
    )
  ).map(mapMember);
}

export async function assignMember(
  projectId: number,
  body: ProjectMemberAssignDto,
) {
  return mapMember(
    await jsonRequest<ProjectMemberDto>(
      `/admin/projects/${projectId}/members`,
      { method: "POST", body },
    ),
  );
}

export function removeMember(projectId: number, userId: number) {
  return jsonRequest<void>(`/admin/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
}

export async function getLlmConfig() {
  return mapLlmConfig(
    await jsonRequest<LlmConfigResponseDto>("/admin/llm-config"),
  );
}
export async function updateLlmConfig(config: LlmConfigUpdate) {
  return mapLlmConfig(
    await jsonRequest<LlmConfigResponseDto>("/admin/llm-config", {
      method: "PUT",
      body: toLlmConfigDto(config),
    }),
  );
}
export function testLlmConfig() {
  return jsonRequest<{ ok: boolean; detail: string }>(
    "/admin/llm-config/test",
    { method: "POST" },
  );
}
