import { jsonRequest } from './client';
import type { AdminUserCreateDto, AdminUserDto, ProjectMemberAssignDto, ProjectMemberDto } from './dto';
import type { AdminUser, ProjectMember } from './models';

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

export async function listUsers() {
  return (await jsonRequest<AdminUserDto[]>('/admin/users')).map(mapUser);
}

export async function createUser(body: AdminUserCreateDto) {
  return mapUser(await jsonRequest<AdminUserDto>('/admin/users', { method: 'POST', body }));
}

export function deleteUser(id: number) {
  return jsonRequest<void>(`/admin/users/${id}`, { method: 'DELETE' });
}

export async function listProjectMembers(projectId: number) {
  return (await jsonRequest<ProjectMemberDto[]>(`/admin/projects/${projectId}/members`)).map(mapMember);
}

export async function assignMember(projectId: number, body: ProjectMemberAssignDto) {
  return mapMember(await jsonRequest<ProjectMemberDto>(`/admin/projects/${projectId}/members`, { method: 'POST', body }));
}

export function removeMember(projectId: number, userId: number) {
  return jsonRequest<void>(`/admin/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
}
