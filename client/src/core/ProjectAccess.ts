import type { TrackedFile, WorkspaceFile } from '../types/project';

/**
 * 全局系统角色。
 * 项目内的管理/实施角色不由该字段决定，而由项目数据中的
 * managerId / implementerIds 动态判断。
 */
export type Role = 'admin' | 'user';

/**
 * 系统用户。
 * 全局角色仅区分是否为管理员；项目内的具体角色（负责人/实施人）
 * 完全由项目数据中的 managerId 和 implementerIds 决定。
 */
export interface User {
  /** 用户唯一编号 */
  id: string;

  /** 是否为系统管理员 */
  isAdmin: boolean;

  /** 全局系统角色 */
  role: Role;
}

/**
 * 权限判断所需的最小项目数据结构。
 */
export interface ProjectPermission {
  /** 项目负责人 ID */
  managerId: string;

  /** 项目实施人 ID 列表 */
  implementerIds: string[];
}

/**
 * 判断用户是否对项目具有查看权限。
 *
 * 规则：
 * - 系统管理员（isAdmin）可直接查看任何项目；
 * - 项目负责人（user.id === project.managerId）可查看；
 * - 项目实施人（user.id 在 project.implementerIds 中）可查看。
 *
 * @param user 当前用户
 * @param project 目标项目
 * @returns 是否可查看
 */
export function canViewProject(user: User, project: ProjectPermission): boolean {
  if (user.isAdmin) return true;
  if (user.id === project.managerId) return true;
  if (project.implementerIds.includes(user.id)) return true;
  return false;
}

/**
 * 判断用户是否对文件具有查看权限。
 *
 * 文件可见性直接继承自项目可见性：只要用户能查看文件所属项目，
 * 就能查看该项目下的过程性文件或被追踪交付物。
 *
 * @param user 当前用户
 * @param file 目标文件（过程性文件或被追踪交付物）
 * @param project 文件所属项目
 * @returns 是否可查看
 */
export function canViewFile(
  user: User,
  file: WorkspaceFile | TrackedFile,
  project: ProjectPermission
): boolean {
  void file;
  return canViewProject(user, project);
}

/**
 * 判断用户是否对项目具有管理权限。
 *
 * 规则：
 * - 系统管理员（isAdmin）可管理任何项目；
 * - 仅项目负责人（user.id === project.managerId）可管理项目。
 *
 * @param user 当前用户
 * @param project 目标项目
 * @returns 是否可管理
 */
export function canManageProject(user: User, project: ProjectPermission): boolean {
  if (user.isAdmin) return true;
  if (user.id === project.managerId) return true;
  return false;
}

/**
 * 判断用户是否可在项目中上传过程性文件。
 *
 * 规则：
 * - 系统管理员（isAdmin）可上传；
 * - 项目负责人（user.id === project.managerId）可上传；
 * - 项目实施人（user.id 在 project.implementerIds 中）可上传。
 *
 * @param user 当前用户
 * @param project 目标项目
 * @returns 是否可上传过程性文件
 */
export function canUploadProcessFile(user: User, project: ProjectPermission): boolean {
  if (user.isAdmin) return true;
  if (user.id === project.managerId) return true;
  if (project.implementerIds.includes(user.id)) return true;
  return false;
}

/**
 * 过滤出用户可见的项目列表。
 *
 * @param projects 项目列表
 * @param user 当前用户
 * @returns 用户可见的项目列表
 */
export function filterVisibleProjects(projects: ProjectPermission[], user: User): ProjectPermission[] {
  return projects.filter((project) => canViewProject(user, project));
}

/**
 * 过滤出用户在特定项目下可见的文件列表。
 *
 * @param files 文件列表
 * @param user 当前用户
 * @param project 文件所属项目
 * @returns 用户可见的文件列表
 */
export function filterVisibleFiles(
  files: (WorkspaceFile | TrackedFile)[],
  user: User,
  project: ProjectPermission
): (WorkspaceFile | TrackedFile)[] {
  if (!canViewProject(user, project)) return [];
  return files.filter((file) => canViewFile(user, file, project));
}

// ==================== 测试断言示例 ====================

const admin: User = { id: 'U_ADMIN', isAdmin: true, role: 'admin' };
const userA: User = { id: 'U_A', isAdmin: false, role: 'user' };
const userB: User = { id: 'U_B', isAdmin: false, role: 'user' };

const project1: ProjectPermission = { managerId: 'U_A', implementerIds: ['U_C'] };
const project2: ProjectPermission = { managerId: 'U_B', implementerIds: ['U_A', 'U_D'] };

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 管理员可操作所有项目
assert(canViewProject(admin, project1), '管理员应能查看项目1');
assert(canViewProject(admin, project2), '管理员应能查看项目2');
assert(canManageProject(admin, project1), '管理员应能管理项目1');
assert(canManageProject(admin, project2), '管理员应能管理项目2');
assert(canUploadProcessFile(admin, project1), '管理员应能在项目1上传文件');

// 用户 A 是项目1的负责人，项目2的实施人
assert(canViewProject(userA, project1), '用户A作为项目1负责人应能查看');
assert(canManageProject(userA, project1), '用户A作为项目1负责人应能管理');
assert(canUploadProcessFile(userA, project1), '用户A作为项目1负责人应能上传');

assert(canViewProject(userA, project2), '用户A作为项目2实施人应能查看');
assert(!canManageProject(userA, project2), '用户A作为项目2实施人不应管理');
assert(canUploadProcessFile(userA, project2), '用户A作为项目2实施人应能上传');

// 用户 B 是项目2的负责人
assert(!canViewProject(userB, project1), '用户B不应查看项目1');
assert(canViewProject(userB, project2), '用户B作为项目2负责人应能查看');
assert(canManageProject(userB, project2), '用户B作为项目2负责人应能管理');
assert(canUploadProcessFile(userB, project2), '用户B作为项目2负责人应能上传');

const visibleToA = filterVisibleProjects([project1, project2], userA);
assert(visibleToA.length === 2, '用户A应能看到2个项目');

const visibleToB = filterVisibleProjects([project1, project2], userB);
assert(visibleToB.length === 1, '用户B应能看到1个项目');
assert(visibleToB[0] === project2, '用户B看到的项目应为项目2');
