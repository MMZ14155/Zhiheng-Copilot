import { describe, it, expect } from 'vitest'
import {
  canViewProject,
  canManageProject,
  canUploadProcessFile,
  canViewFile,
  filterVisibleProjects,
  filterVisibleFiles,
} from '../../core/ProjectAccess'
import type { User, ProjectPermission } from '../../core/ProjectAccess'
import type { WorkspaceFile, TrackedFile, FileVersion } from '../../types/project'

// ==================== 测试辅助构造器 ====================

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'U_X',
    isAdmin: false,
    role: 'user',
    ...overrides,
  }
}

function makePermission(overrides: Partial<ProjectPermission> = {}): ProjectPermission {
  return {
    managerId: 'U_MGR',
    implementerIds: ['U_IMP'],
    ...overrides,
  }
}

function makeVersion(overrides: Partial<FileVersion> = {}): FileVersion {
  return {
    version: 'v1.0',
    filePath: '/tmp/test.docx',
    uploadedBy: 'U_MGR',
    uploadedAt: '2026-07-19T00:00:00.000Z',
    size: 1024,
    hash: 'abc123',
    changelog: 'init',
    isFrozen: false,
    ...overrides,
  }
}

function makeWorkspaceFile(overrides: Partial<WorkspaceFile> = {}): WorkspaceFile {
  return {
    id: 'F001',
    name: 'report.docx',
    path: '/tmp/report.docx',
    versions: [makeVersion()],
    tags: [],
    isDeliverable: false,
    ...overrides,
  }
}

function makeTrackedFile(overrides: Partial<TrackedFile> = {}): TrackedFile {
  return {
    id: 'F002',
    name: 'deliverable.docx',
    category: '交付成果',
    currentVersion: 'v1.0',
    versions: [makeVersion()],
    required: true,
    status: 'ok',
    ...overrides,
  }
}

const admin = makeUser({ id: 'U_ADMIN', isAdmin: true, role: 'admin' })
const manager = makeUser({ id: 'U_MGR' })
const implementer = makeUser({ id: 'U_IMP' })
const outsider = makeUser({ id: 'U_NOONE' })

const baseProject = makePermission({
  managerId: 'U_MGR',
  implementerIds: ['U_IMP'],
})

// ==================== canViewProject ====================

describe('canViewProject', () => {
  it('系统管理员可查看任意项目', () => {
    expect(canViewProject(admin, baseProject)).toBe(true)
  })

  it('项目负责人可查看', () => {
    expect(canViewProject(manager, baseProject)).toBe(true)
  })

  it('项目实施人可查看', () => {
    expect(canViewProject(implementer, baseProject)).toBe(true)
  })

  it('无关用户不可查看', () => {
    expect(canViewProject(outsider, baseProject)).toBe(false)
  })

  it('管理员与负责人身份可同时命中', () => {
    const adminMgr = makeUser({ id: 'U_MGR', isAdmin: true, role: 'admin' })
    expect(canViewProject(adminMgr, baseProject)).toBe(true)
  })

  it('实施人列表为空时仅管理员与负责人可查看', () => {
    const project = makePermission({ implementerIds: [] })
    expect(canViewProject(admin, project)).toBe(true)
    expect(canViewProject(manager, project)).toBe(true)
    expect(canViewProject(implementer, project)).toBe(false)
  })
})

// ==================== canManageProject ====================

describe('canManageProject', () => {
  it('系统管理员可管理任意项目', () => {
    expect(canManageProject(admin, baseProject)).toBe(true)
  })

  it('项目负责人可管理', () => {
    expect(canManageProject(manager, baseProject)).toBe(true)
  })

  it('项目实施人不可管理', () => {
    expect(canManageProject(implementer, baseProject)).toBe(false)
  })

  it('无关用户不可管理', () => {
    expect(canManageProject(outsider, baseProject)).toBe(false)
  })

  it('管理员同时为负责人仍可管理', () => {
    const adminMgr = makeUser({ id: 'U_MGR', isAdmin: true, role: 'admin' })
    expect(canManageProject(adminMgr, baseProject)).toBe(true)
  })

  it('管理员同时为实施人也可管理', () => {
    const adminImp = makeUser({ id: 'U_IMP', isAdmin: true, role: 'admin' })
    expect(canManageProject(adminImp, baseProject)).toBe(true)
  })
})

// ==================== canUploadProcessFile ====================

describe('canUploadProcessFile', () => {
  it('系统管理员可上传', () => {
    expect(canUploadProcessFile(admin, baseProject)).toBe(true)
  })

  it('项目负责人可上传', () => {
    expect(canUploadProcessFile(manager, baseProject)).toBe(true)
  })

  it('项目实施人可上传', () => {
    expect(canUploadProcessFile(implementer, baseProject)).toBe(true)
  })

  it('无关用户不可上传', () => {
    expect(canUploadProcessFile(outsider, baseProject)).toBe(false)
  })

  it('实施人列表为空时实施人不可上传', () => {
    const project = makePermission({ implementerIds: [] })
    expect(canUploadProcessFile(implementer, project)).toBe(false)
    expect(canUploadProcessFile(manager, project)).toBe(true)
    expect(canUploadProcessFile(admin, project)).toBe(true)
  })

  it('用户在实施人列表中多个项目都可上传', () => {
    const project = makePermission({ implementerIds: ['U_A', 'U_IMP', 'U_B'] })
    expect(canUploadProcessFile(implementer, project)).toBe(true)
  })
})

// ==================== canViewFile ====================

describe('canViewFile', () => {
  it('管理员可查看过程性文件', () => {
    const file = makeWorkspaceFile()
    expect(canViewFile(admin, file, baseProject)).toBe(true)
  })

  it('管理员可查看被追踪交付物', () => {
    const file = makeTrackedFile()
    expect(canViewFile(admin, file, baseProject)).toBe(true)
  })

  it('负责人可查看过程性文件', () => {
    const file = makeWorkspaceFile()
    expect(canViewFile(manager, file, baseProject)).toBe(true)
  })

  it('实施人可查看被追踪交付物', () => {
    const file = makeTrackedFile()
    expect(canViewFile(implementer, file, baseProject)).toBe(true)
  })

  it('无关用户不可查看过程性文件', () => {
    const file = makeWorkspaceFile()
    expect(canViewFile(outsider, file, baseProject)).toBe(false)
  })

  it('无关用户不可查看被追踪交付物', () => {
    const file = makeTrackedFile()
    expect(canViewFile(outsider, file, baseProject)).toBe(false)
  })

  it('文件可见性完全继承项目可见性', () => {
    const wsFile = makeWorkspaceFile()
    const trFile = makeTrackedFile()
    expect(canViewFile(manager, wsFile, baseProject)).toBe(canViewProject(manager, baseProject))
    expect(canViewFile(outsider, trFile, baseProject)).toBe(canViewProject(outsider, baseProject))
  })
})

// ==================== filterVisibleProjects ====================

describe('filterVisibleProjects', () => {
  it('管理员可见全部项目', () => {
    const p1 = makePermission({ managerId: 'U_MGR' })
    const p2 = makePermission({ managerId: 'U_OTHER' })
    const result = filterVisibleProjects([p1, p2], admin)
    expect(result).toHaveLength(2)
  })

  it('负责人仅可见自己负责的项目', () => {
    const p1 = makePermission({ managerId: 'U_MGR' })
    const p2 = makePermission({ managerId: 'U_OTHER' })
    const result = filterVisibleProjects([p1, p2], manager)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(p1)
  })

  it('实施人可见自己参与的项目', () => {
    const p1 = makePermission({ implementerIds: ['U_IMP'] })
    const p2 = makePermission({ implementerIds: ['U_X'] })
    const result = filterVisibleProjects([p1, p2], implementer)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(p1)
  })

  it('无关用户不可见任何项目', () => {
    const p1 = makePermission({ managerId: 'U_MGR' })
    const p2 = makePermission({ managerId: 'U_OTHER' })
    const result = filterVisibleProjects([p1, p2], outsider)
    expect(result).toHaveLength(0)
  })

  it('空项目列表返回空数组', () => {
    expect(filterVisibleProjects([], admin)).toEqual([])
  })

  it('用户同时为多个项目实施人时全部可见', () => {
    const p1 = makePermission({ implementerIds: ['U_IMP'] })
    const p2 = makePermission({ managerId: 'U_IMP' })
    const result = filterVisibleProjects([p1, p2], implementer)
    expect(result).toHaveLength(2)
  })

  it('保持原列表顺序', () => {
    const p1 = makePermission({ managerId: 'U_MGR' })
    const p2 = makePermission({ implementerIds: ['U_IMP'] })
    const result = filterVisibleProjects([p1, p2], manager)
    expect(result[0]).toBe(p1)
    expect(result[1]).toBe(p2)
  })
})

// ==================== filterVisibleFiles ====================

describe('filterVisibleFiles', () => {
  it('用户可查看项目时返回全部文件', () => {
    const wsFile = makeWorkspaceFile({ id: 'F1' })
    const trFile = makeTrackedFile({ id: 'F2' })
    const result = filterVisibleFiles([wsFile, trFile], manager, baseProject)
    expect(result).toHaveLength(2)
  })

  it('管理员可查看项目下全部文件', () => {
    const files = [makeWorkspaceFile(), makeTrackedFile()]
    const result = filterVisibleFiles(files, admin, baseProject)
    expect(result).toHaveLength(2)
  })

  it('用户不可查看项目时返回空数组', () => {
    const files = [makeWorkspaceFile(), makeTrackedFile()]
    const result = filterVisibleFiles(files, outsider, baseProject)
    expect(result).toEqual([])
  })

  it('空文件列表返回空数组', () => {
    const result = filterVisibleFiles([], manager, baseProject)
    expect(result).toEqual([])
  })

  it('实施人可查看项目下全部文件', () => {
    const files = [makeWorkspaceFile(), makeTrackedFile()]
    const result = filterVisibleFiles(files, implementer, baseProject)
    expect(result).toHaveLength(2)
  })

  it('返回结果保持原顺序', () => {
    const f1 = makeWorkspaceFile({ id: 'A' })
    const f2 = makeTrackedFile({ id: 'B' })
    const f3 = makeWorkspaceFile({ id: 'C' })
    const result = filterVisibleFiles([f1, f2, f3], admin, baseProject)
    expect(result.map((f) => f.id)).toEqual(['A', 'B', 'C'])
  })
})
