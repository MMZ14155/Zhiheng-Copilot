import { describe, it, expect } from 'vitest'
import {
  generateVersionHash,
  promoteToDeliverable,
  createFrozenVersion,
  createTagSnapshot,
  getEffectiveVersion,
  getFileVersionById,
  displayVersion,
} from '../../core/FileFlow'
import type {
  FileVersion,
  WorkspaceFile,
  TrackedFile,
  Tag,
} from '../../types/project'

// ==================== 测试辅助构造器 ====================

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
    id: 'F001',
    name: 'report.docx',
    category: '交付成果',
    currentVersion: 'v1.0',
    versions: [makeVersion()],
    required: true,
    status: 'ok',
    ...overrides,
  }
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'T001',
    name: '里程碑A',
    type: 'report',
    createdBy: 'U_MGR',
    createdAt: '2026-07-19T00:00:00.000Z',
    note: '里程碑快照',
    extraFiles: [],
    ...overrides,
  }
}

const HEX_REGEX = /^[0-9a-f]{64}$/

// ==================== generateVersionHash ====================

describe('generateVersionHash', () => {
  it('返回 64 位十六进制哈希字符串', async () => {
    const files = [
      { name: 'a.txt', content: new Uint8Array([1, 2, 3]) },
      { name: 'b.txt', content: new Uint8Array([4, 5, 6]) },
    ]
    const hash = await generateVersionHash(files, 'U_MGR', 'init')
    expect(hash).toMatch(HEX_REGEX)
  })

  it('相同输入产生相同哈希（确定性）', async () => {
    const files = [
      { name: 'a.txt', content: new Uint8Array([1, 2, 3]) },
      { name: 'b.txt', content: new Uint8Array([4, 5, 6]) },
    ]
    const h1 = await generateVersionHash(files, 'U_MGR', 'init')
    const h2 = await generateVersionHash(files, 'U_MGR', 'init')
    expect(h1).toBe(h2)
  })

  it('文件顺序不同产生相同哈希（内部按名排序）', async () => {
    const a = { name: 'a.txt', content: new Uint8Array([1, 2, 3]) }
    const b = { name: 'b.txt', content: new Uint8Array([4, 5, 6]) }
    const h1 = await generateVersionHash([a, b], 'U_MGR', 'init')
    const h2 = await generateVersionHash([b, a], 'U_MGR', 'init')
    expect(h1).toBe(h2)
  })

  it('文件内容不同产生不同哈希', async () => {
    const a = { name: 'a.txt', content: new Uint8Array([1, 2, 3]) }
    const b = { name: 'a.txt', content: new Uint8Array([1, 2, 4]) }
    const h1 = await generateVersionHash([a], 'U_MGR', 'init')
    const h2 = await generateVersionHash([b], 'U_MGR', 'init')
    expect(h1).not.toBe(h2)
  })

  it('文件名不同产生不同哈希', async () => {
    const a = { name: 'a.txt', content: new Uint8Array([1, 2, 3]) }
    const b = { name: 'b.txt', content: new Uint8Array([1, 2, 3]) }
    const h1 = await generateVersionHash([a], 'U_MGR', 'init')
    const h2 = await generateVersionHash([b], 'U_MGR', 'init')
    expect(h1).not.toBe(h2)
  })

  it('uploadedBy 不同产生不同哈希', async () => {
    const files = [{ name: 'a.txt', content: new Uint8Array([1, 2, 3]) }]
    const h1 = await generateVersionHash(files, 'U_MGR', 'init')
    const h2 = await generateVersionHash(files, 'U_OTHER', 'init')
    expect(h1).not.toBe(h2)
  })

  it('changelog 不同产生不同哈希', async () => {
    const files = [{ name: 'a.txt', content: new Uint8Array([1, 2, 3]) }]
    const h1 = await generateVersionHash(files, 'U_MGR', 'init')
    const h2 = await generateVersionHash(files, 'U_MGR', 'update')
    expect(h1).not.toBe(h2)
  })

  it('空文件集合仍返回有效哈希', async () => {
    const hash = await generateVersionHash([], 'U_MGR', 'init')
    expect(hash).toMatch(HEX_REGEX)
  })

  it('Uint8Array 与等价 ArrayBuffer 内容产生相同哈希', async () => {
    const uintHash = await generateVersionHash(
      [{ name: 'a.txt', content: new Uint8Array([1, 2, 3]) }],
      'U_MGR',
      'init'
    )
    const buf = new ArrayBuffer(3)
    new Uint8Array(buf).set([1, 2, 3])
    const bufHash = await generateVersionHash(
      [{ name: 'a.txt', content: buf }],
      'U_MGR',
      'init'
    )
    expect(uintHash).toBe(bufHash)
  })

  it('零字节内容文件仍可正常计算哈希', async () => {
    const hash = await generateVersionHash(
      [{ name: 'empty.txt', content: new Uint8Array([]) }],
      'U_MGR',
      'init'
    )
    expect(hash).toMatch(HEX_REGEX)
  })

  it('单文件与多文件哈希不同', async () => {
    const single = await generateVersionHash(
      [{ name: 'a.txt', content: new Uint8Array([1, 2, 3]) }],
      'U_MGR',
      'init'
    )
    const multi = await generateVersionHash(
      [
        { name: 'a.txt', content: new Uint8Array([1, 2, 3]) },
        { name: 'b.txt', content: new Uint8Array([4, 5, 6]) },
      ],
      'U_MGR',
      'init'
    )
    expect(single).not.toBe(multi)
  })
})

// ==================== promoteToDeliverable ====================

describe('promoteToDeliverable', () => {
  it('有版本时 status 为 ok 且 currentVersion 取最新版本号', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const v2 = makeVersion({ version: 'v2.0' })
    const file = makeWorkspaceFile({ versions: [v1, v2] })

    const tracked = promoteToDeliverable(file, '交付成果', true)

    expect(tracked.status).toBe('ok')
    expect(tracked.currentVersion).toBe('v2.0')
    expect(tracked.id).toBe(file.id)
    expect(tracked.name).toBe(file.name)
    expect(tracked.category).toBe('交付成果')
    expect(tracked.required).toBe(true)
  })

  it('所有版本被标记为冻结（isFrozen = true）', () => {
    const v1 = makeVersion({ version: 'v1.0', isFrozen: false })
    const v2 = makeVersion({ version: 'v2.0', isFrozen: false })
    const file = makeWorkspaceFile({ versions: [v1, v2] })

    const tracked = promoteToDeliverable(file, '验收材料', false)

    expect(tracked.versions).toHaveLength(2)
    expect(tracked.versions[0].isFrozen).toBe(true)
    expect(tracked.versions[1].isFrozen).toBe(true)
  })

  it('空版本列表时 status 为 missing 且 currentVersion 为空串', () => {
    const file = makeWorkspaceFile({ versions: [] })

    const tracked = promoteToDeliverable(file, '合同', false)

    expect(tracked.status).toBe('missing')
    expect(tracked.currentVersion).toBe('')
    expect(tracked.versions).toEqual([])
  })

  it('不修改原始文件版本数据', () => {
    const v1 = makeVersion({ version: 'v1.0', isFrozen: false })
    const file = makeWorkspaceFile({ versions: [v1] })

    promoteToDeliverable(file, '交付成果', true)

    expect(v1.isFrozen).toBe(false)
  })

  it('required 与 category 透传到被追踪交付物', () => {
    const file = makeWorkspaceFile()
    const tracked = promoteToDeliverable(file, '检测报告', false)
    expect(tracked.category).toBe('检测报告')
    expect(tracked.required).toBe(false)
  })
})

// ==================== createFrozenVersion ====================

describe('createFrozenVersion', () => {
  it('返回 isFrozen 为 true 的版本', async () => {
    const f1 = { fileRef: makeWorkspaceFile({ name: 'a.txt' }), content: new Uint8Array([1, 2, 3]) }
    const version = await createFrozenVersion([f1], 'U_MGR', 'init')

    expect(version.isFrozen).toBe(true)
  })

  it('version 与 hash 字段等于 generateVersionHash 结果', async () => {
    const f1 = {
      fileRef: makeWorkspaceFile({ name: 'a.txt' }),
      content: new Uint8Array([1, 2, 3]),
    }
    const expectedHash = await generateVersionHash(
      [{ name: 'a.txt', content: new Uint8Array([1, 2, 3]) }],
      'U_MGR',
      'init'
    )
    const version = await createFrozenVersion([f1], 'U_MGR', 'init')

    expect(version.version).toBe(expectedHash)
    expect(version.hash).toBe(expectedHash)
  })

  it('filePath 为空串', async () => {
    const f1 = {
      fileRef: makeWorkspaceFile({ name: 'a.txt' }),
      content: new Uint8Array([1, 2, 3]),
    }
    const version = await createFrozenVersion([f1], 'U_MGR', 'init')
    expect(version.filePath).toBe('')
  })

  it('uploadedBy 与 changelog 透传', async () => {
    const f1 = {
      fileRef: makeWorkspaceFile({ name: 'a.txt' }),
      content: new Uint8Array([1, 2, 3]),
    }
    const version = await createFrozenVersion([f1], 'U_UPLOAD', 'first commit')
    expect(version.uploadedBy).toBe('U_UPLOAD')
    expect(version.changelog).toBe('first commit')
  })

  it('size 为所有文件内容字节总和', async () => {
    const f1 = {
      fileRef: makeWorkspaceFile({ name: 'a.txt' }),
      content: new Uint8Array([1, 2, 3]),
    }
    const f2 = {
      fileRef: makeWorkspaceFile({ name: 'b.txt' }),
      content: new Uint8Array([4, 5]),
    }
    const version = await createFrozenVersion([f1, f2], 'U_MGR', 'init')
    expect(version.size).toBe(5)
  })

  it('ArrayBuffer 内容计入 size', async () => {
    const buf = new ArrayBuffer(4)
    new Uint8Array(buf).set([1, 2, 3, 4])
    const f1 = { fileRef: makeWorkspaceFile({ name: 'a.txt' }), content: buf }
    const version = await createFrozenVersion([f1], 'U_MGR', 'init')
    expect(version.size).toBe(4)
  })

  it('uploadedAt 为合法 ISO 时间字符串', async () => {
    const f1 = {
      fileRef: makeWorkspaceFile({ name: 'a.txt' }),
      content: new Uint8Array([1, 2, 3]),
    }
    const version = await createFrozenVersion([f1], 'U_MGR', 'init')
    const parsed = new Date(version.uploadedAt)
    expect(parsed.getTime()).not.toBeNaN()
  })
})

// ==================== createTagSnapshot ====================

describe('createTagSnapshot', () => {
  it('id 由 tag.id、sourceFileId、version 拼接', () => {
    const tag = makeTag({ id: 'T001' })
    const snap = createTagSnapshot(tag, 'F001', 'v1.0')
    expect(snap.id).toBe('T001-F001-v1.0')
  })

  it('name 为 `${tag.name} 快照`', () => {
    const tag = makeTag({ name: '里程碑A' })
    const snap = createTagSnapshot(tag, 'F001', 'v1.0')
    expect(snap.name).toBe('里程碑A 快照')
  })

  it('sourceFileId 与 snapshotVersion 透传', () => {
    const tag = makeTag()
    const snap = createTagSnapshot(tag, 'F002', 'v3.0')
    expect(snap.sourceFileId).toBe('F002')
    expect(snap.snapshotVersion).toBe('v3.0')
  })

  it('未传 note 时使用默认备注', () => {
    const tag = makeTag({ name: '里程碑A' })
    const snap = createTagSnapshot(tag, 'F001', 'v1.0')
    expect(snap.note).toContain('里程碑A')
    expect(snap.note).toContain('快照')
  })

  it('传入 note 时使用传入值', () => {
    const tag = makeTag()
    const snap = createTagSnapshot(tag, 'F001', 'v1.0', '自定义备注')
    expect(snap.note).toBe('自定义备注')
  })
})

// ==================== getEffectiveVersion ====================

describe('getEffectiveVersion', () => {
  it('返回匹配 currentVersion 的版本', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const v2 = makeVersion({ version: 'v2.0' })
    const file = makeTrackedFile({ currentVersion: 'v2.0', versions: [v1, v2] })

    const effective = getEffectiveVersion(file)

    expect(effective.version).toBe('v2.0')
  })

  it('currentVersion 为首版本时返回首版本', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const file = makeTrackedFile({ currentVersion: 'v1.0', versions: [v1] })

    const effective = getEffectiveVersion(file)

    expect(effective.version).toBe('v1.0')
  })

  it('找不到匹配版本时抛出错误', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const file = makeTrackedFile({ currentVersion: 'vX', versions: [v1] })

    expect(() => getEffectiveVersion(file)).toThrowError(
      /Effective version .* not found/
    )
  })

  it('错误信息包含文件 ID 与目标版本', () => {
    const file = makeTrackedFile({
      id: 'F999',
      currentVersion: 'nope',
      versions: [],
    })
    expect(() => getEffectiveVersion(file)).toThrowError(/F999/)
    expect(() => getEffectiveVersion(file)).toThrowError(/nope/)
  })
})

// ==================== getFileVersionById ====================

describe('getFileVersionById', () => {
  it('TrackedFile 中找到匹配版本', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const v2 = makeVersion({ version: 'v2.0' })
    const file = makeTrackedFile({ versions: [v1, v2] })

    const found = getFileVersionById(file, 'v2.0')

    expect(found).toBeDefined()
    expect(found?.version).toBe('v2.0')
  })

  it('WorkspaceFile 中找到匹配版本', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const file = makeWorkspaceFile({ versions: [v1] })

    const found = getFileVersionById(file, 'v1.0')

    expect(found).toBeDefined()
    expect(found?.version).toBe('v1.0')
  })

  it('未找到匹配版本时返回 undefined', () => {
    const v1 = makeVersion({ version: 'v1.0' })
    const file = makeTrackedFile({ versions: [v1] })

    const found = getFileVersionById(file, 'vX')

    expect(found).toBeUndefined()
  })

  it('空版本列表返回 undefined', () => {
    const file = makeTrackedFile({ versions: [] })
    expect(getFileVersionById(file, 'v1.0')).toBeUndefined()
  })
})

// ==================== displayVersion ====================

describe('displayVersion', () => {
  it('截取前 7 位', () => {
    const hash = 'abcdefghijklmnopqrstuvwxyz1234567890'
    expect(displayVersion(hash)).toBe('abcdefg')
  })

  it('64 位哈希返回 7 位短版本', () => {
    const hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    expect(displayVersion(hash)).toBe('0123456')
    expect(displayVersion(hash)).toHaveLength(7)
  })

  it('空字符串返回空字符串', () => {
    expect(displayVersion('')).toBe('')
  })

  it('短于 7 位的字符串返回原串', () => {
    expect(displayVersion('abc')).toBe('abc')
  })

  it('正好 7 位的字符串返回原串', () => {
    expect(displayVersion('abcdefg')).toBe('abcdefg')
  })
})
