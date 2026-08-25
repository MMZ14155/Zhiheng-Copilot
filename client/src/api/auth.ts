import { jsonRequest } from "./client";
import type { LoginResponseDto, UserDto } from "./dto";
import type { CurrentUser } from "./models";

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: CurrentUser;
}

let loginNotice: string | null = null;
export function setLoginNotice(message: string) {
  loginNotice = message;
}
export function consumeLoginNotice() {
  const message = loginNotice;
  loginNotice = null;
  return message;
}

// 后端 UserResponse 实际字段为 is_admin（布尔），与云端 DTO 初稿的 role 不一致，按任务约定在此修正映射。
const mapUser = (dto: UserDto): CurrentUser => ({
  id: dto.id,
  login: dto.login,
  name: dto.name,
  isAdmin: dto.is_admin,
});

export async function login(
  login: string,
  password: string,
): Promise<AuthSession> {
  const dto = await jsonRequest<LoginResponseDto>("/auth/login", {
    method: "POST",
    body: { login, password },
  });
  return {
    token: dto.token,
    expiresAt: dto.expires_at,
    user: mapUser(dto.user),
  };
}

export const me = async (): Promise<CurrentUser> =>
  mapUser(await jsonRequest<UserDto>("/auth/me"));

export function changePassword(oldPassword: string, newPassword: string) {
  return jsonRequest<void>(
    "/auth/change-password",
    {
      method: "POST",
      body: { old_password: oldPassword, new_password: newPassword },
    },
    { clearAuthOnUnauthorized: false },
  );
}
