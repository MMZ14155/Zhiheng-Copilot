import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getAuthToken, getAuthUser, setAuthToken, setAuthUser, subscribeAuth } from '../api/client'
import { jsonRequest, multipartRequest, queryString } from '../api/client'
import * as auth from '../api/auth'
import * as projects from '../api/projects'
import * as files from '../api/files'
import * as deliverables from '../api/deliverables'
import * as tags from '../api/tags'
import * as ai from '../api/ai'
import * as statistics from '../api/statistics'
import * as snapshots from '../api/snapshots'
import { projects as legacyProjects } from '../data/projects'
import { docProjects } from '../data/docs'

const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body) }) as unknown as Response
const blobResponse = (blob: Blob, headers: Record<string, string> = {}) => ({ ok: true, status: 200, blob: vi.fn().mockResolvedValue(blob), headers: new Headers(headers) }) as unknown as Response
const project = { id: 1, name: '项目', code: 'P1', customer_name: '客户', project_type: '软件销售', parties: [], contract_amount: 10, signed_date: null, started_date: null, planned_delivery_date: null, status: 'active', progress: 30, notes: null, created_at: 'x', updated_at: 'y', links: null }

describe('API client', () => {
  beforeEach(() => { setAuthToken(null); vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => vi.unstubAllGlobals())

  it('管理内存会话并通知订阅者', () => {
    const listener = vi.fn(); const unsubscribe = subscribeAuth(listener)
    const user = { id: 1, login: 'a', name: '甲', isAdmin: false }
    setAuthToken('token', user); expect(getAuthToken()).toBe('token'); expect(getAuthUser()).toEqual(user)
    setAuthUser({ ...user, name: '乙' }); expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe(); setAuthToken(null); expect(getAuthUser()).toBeNull(); expect(listener).toHaveBeenCalledTimes(2)
  })

  it('合并 JSON 与认证请求头并处理 204', async () => {
    setAuthToken('secret'); vi.mocked(fetch).mockResolvedValueOnce(response({}, 204))
    await expect(jsonRequest('/x', { method: 'POST', headers: { 'X-Test': 'yes' }, body: { a: 1 } })).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/v1/x', expect.objectContaining({ method: 'POST', body: '{"a":1}', headers: { 'Content-Type': 'application/json', 'X-Test': 'yes', Authorization: 'Bearer secret' } }))
  })

  it('发送 multipart 且不手工设置 Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ok: true })); const data = new FormData()
    await multipartRequest('/upload', data)
    expect(fetch).toHaveBeenCalledWith('/api/v1/upload', { method: 'POST', body: data, headers: {} })
  })

  it('解析服务端错误与兜底错误并在 401 清会话', async () => {
    setAuthToken('bad'); vi.mocked(fetch).mockResolvedValueOnce(response({ detail: '失效', code: 'AUTH' }, 401))
    await expect(jsonRequest('/private')).rejects.toEqual(expect.objectContaining({ name: 'ApiError', message: '失效', code: 'AUTH', status: 401 })); expect(getAuthToken()).toBeNull()
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn().mockRejectedValue(new Error()) } as unknown as Response)
    await expect(jsonRequest('/bad')).rejects.toEqual(new ApiError('请求失败，请稍后重试', 'HTTP_ERROR', 500))
  })

  it('序列化查询参数并忽略 undefined', () => {
    expect(queryString({ page: 2, q: 'a b', empty: undefined })).toBe('?page=2&q=a+b'); expect(queryString({ x: undefined })).toBe('')
  })
})

describe('静态数据模块', () => {
  it('导出项目与资料种子数据', () => {
    expect(legacyProjects.length).toBeGreaterThan(0)
    expect(docProjects.length).toBeGreaterThan(0)
  })
})

describe('API domain modules', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
  afterEach(() => vi.unstubAllGlobals())
  const next = (body: unknown, status = 200) => vi.mocked(fetch).mockResolvedValueOnce(response(body, status))

  it('映射登录用户与当前用户', async () => {
    next({ token: 't', expires_at: 'later', user: { id: 1, login: 'u', name: 'U', is_admin: true } })
    await expect(auth.login('u', 'p')).resolves.toEqual({ token: 't', expiresAt: 'later', user: { id: 1, login: 'u', name: 'U', isAdmin: true } })
    next({ id: 2, login: 'v', name: 'V', is_admin: false }); await expect(auth.me()).resolves.toEqual({ id: 2, login: 'v', name: 'V', isAdmin: false })
  })

  it('序列化项目参数并映射列表、详情与风险', async () => {
    next({ page: 1, size: 20, total: 1, items: [project] }); const list = await projects.listProjects({ page: 1, size: 20, clientName: '客户', projectType: '软件销售', expand: 'links' })
    expect(list.items[0]).toMatchObject({ id: '1', customerName: '客户', projectType: '软件销售' }); expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('client_name='); expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('project_type=')
    next({ ...project, deliverables: [{ id: 9, name: '合同', created_at: 'x', updated_at: 'y' }], latest_summary: null }); expect((await projects.getProject(1)).deliverables[0].id).toBe('9')
    next({ level: 'warn', risks: [{ type: 'payment-overdue', level: 'warn', reason: 'r', recommendation: 'do', remaining_days: null, overdue_days: 7, overdue_amount: 1234.5, data_status: 'complete' }], config: {} }); expect((await projects.getProjectRisks('1')).risks[0]).toMatchObject({ overdueDays: 7, overdueAmount: 1234.5 })
  })

  it('映射回款概览字符串与 null 字段', async () => {
    next({ contract_amount: null, receivable_amount: '5000.50', received_amount: '1200.25', invoiced_amount: '3000.00', overdue_amount: null, collection_rate: '0.2400', data_status: 'incomplete', incomplete_reasons: ['缺少已解析合同'] })
    await expect(projects.getCollectionOverview(7)).resolves.toEqual({ contractAmount: null, receivableAmount: 5000.5, receivedAmount: 1200.25, invoicedAmount: 3000, overdueAmount: null, collectionRate: 0.24, dataStatus: 'incomplete', incompleteReasons: ['缺少已解析合同'] })
    expect(fetch).toHaveBeenCalledWith('/api/v1/projects/7/collection-overview', expect.any(Object))
  })

  it('覆盖项目写操作', async () => {
    for (const action of [() => projects.createProject({ name: 'n', code: 'c', customer_name: 'x' }), () => projects.updateProject(1, { progress: 2 }), () => projects.createProjectLink(1, { target_project_id: 2, link_type: 'related' }), () => projects.deleteProjectLink(4), () => projects.getRenewalChain(1)]) { next({}); await action() }
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/v1/projects', '/api/v1/projects/1', '/api/v1/projects/1/links', '/api/v1/links/4', '/api/v1/projects/1/renewal-chain'])
  })

  it('上传文件、映射文件列表及版本', async () => {
    const file = new File(['abc'], 'a.txt'); next({ file_id: 1, version: 'v', message: 'ok' }); await files.createFile(2, { file, name: 'A', changelog: 'c', docType: 'contract' })
    next({ file_id: 1, version: 'v2', message: 'ok' }); await files.appendFileVersion(1, { file })
    next({ file_id: 1, versions: [{ version: 'v1' }, { version: 'v2' }] }); expect(await files.listFileVersionOptions(1)).toEqual(['v1', 'v2'])
    next({ files: [{ id: 1, name: 'A', is_deliverable: true, created_at: 'c', updated_at: 'u', latest_version: { version: 'v', document_type: null, parse_status: 'done', size_bytes: 3, uploaded_at: 'u' } }, { id: 2, name: 'B', is_deliverable: false, created_at: 'c', updated_at: 'u', latest_version: null }] }); expect((await files.listProjectFiles(2))[1].latestVersion).toBeNull()
    const data = new Blob(['content'])
    vi.mocked(fetch).mockResolvedValueOnce(blobResponse(data, { 'content-disposition': 'attachment; filename="report.pdf"' }))
    const downloaded = await files.downloadVersion('abc123')
    expect(downloaded.blob).toBe(data); expect(downloaded.filename).toBe('report.pdf')
    vi.mocked(fetch).mockResolvedValueOnce(blobResponse(data))
    expect((await files.downloadVersion('xyz789')).filename).toBe('xyz789')
  })

  it('映射交付物与标签', async () => {
    const tracked = { id: 1, project_id: 2, source_file_id: 3, name: '合同', category: '合同', required: true, current_version: 'v2', status: 'ok', versions: [{ version: 'v2', prev_version: 'v1', uploaded_by: 'U', changelog: '', parse_status: 'done', document_type: 'contract', size_bytes: 10, is_frozen: false, uploaded_at: 'now' }] }
    next({ items: [tracked] }); expect((await deliverables.listTrackedFiles(2))[0].versions[0].isCurrent).toBe(true)
    next({}); await deliverables.promoteTrackedFile(2, { source_file_id: 3, category: '合同' }); next({}); await deliverables.switchCurrentVersion(1, 'v1')
    next({ items: [{ id: 1, name: '里程碑', type: 'demo', created_by: 'U', note: null, created_at: 'now' }] }); expect((await tags.listTags(2))[0].createdBy).toBe('U')
    next({ items: [{ id: 2, source_file_id: null, file_version: 'v', name: '快照', note: null, created_at: 'now' }] }); expect((await tags.listTagSnapshots(1))[0].sourceFileId).toBeNull()
    next({}); await tags.createTag(2, { name: 'x', type: 'custom' }); next({}); await tags.createTagSnapshot(1, { source_file_id: 3, version: 'v' })
  })

  it('调用全部 AI 端点并处理可选项目参数', async () => {
    const actions = [() => ai.askCopilot('q'), () => ai.askCopilot('q', 2), () => ai.createSummaryTask(2), () => ai.getLatestSummary(2), () => ai.getSummaryHistory(2), () => ai.submitSummaryAnswers(2, [{ question: 'q', answer: 'a' }]), () => ai.createExtractionTask('v'), () => ai.getExtraction('v'), () => ai.getTask(9)]
    for (const action of actions) { next({}); await action() }
    expect(JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body))).toEqual({ question: 'q' }); expect(JSON.parse(String((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body))).toEqual({ question: 'q', project_id: 2 })
  })

  it('映射统计数据并透传 ApiError', async () => {
    const metric = { value: 12, sample_count: 2 }; next({ projects: { total: 1, risks: { block: 0, warn: 1, ok: 0 }, average_cost_usage_rate: metric, average_schedule_usage_rate: metric, average_satisfaction: metric }, files: { workspace_file_total: 2, deliverables: { missing: 0, old: 0, conflict: 0, ok: 1 } }, by_stage: [{ stage: 'executing', count: 1, average_cost_usage_rate: metric, average_schedule_usage_rate: metric, average_satisfaction: metric }], project_type_distribution: { 软件销售: 1 }, delivery_deadline_distribution: { due_soon: 1 }, payment: { contract_amount: 100, invoiced_amount: 80, receivable_amount: 50, received_amount: 40, outstanding_amount: 60, overdue_amount: 10, collection_rate: 0.8, data_incomplete_projects: 0 } })
    const overview = await statistics.getStatisticsOverview(); expect(overview.byStage[0].averageCostUsageRate.sampleCount).toBe(2); expect(overview.payment.receivedAmount).toBe(40); expect(overview.projectTypeDistribution).toEqual({ 软件销售: 1 })
    next({ detail: '禁止', code: 'NO' }, 403); await expect(projects.listProjects()).rejects.toBeInstanceOf(ApiError)
  })

  it('映射快照时间线、详情与恢复结果并发送空请求体', async () => {
    const summary = { hash: 'a'.repeat(64), parent_hash: null, author: '甲', message: '上传合同', created_at: '2026-08-17T08:00:00Z', entry_count: 1 }
    next({ project_id: 7, snapshots: [summary] })
    await expect(snapshots.listSnapshots(7)).resolves.toEqual({ projectId: 7, snapshots: [{ hash: 'a'.repeat(64), parentHash: null, author: '甲', message: '上传合同', createdAt: '2026-08-17T08:00:00Z', entryCount: 1 }] })
    next({ ...summary, project_id: 7, entries: [{ file_id: 3, path: '合同.pdf', version: 'b'.repeat(64), uploader: '乙', uploaded_at: '2026-08-17T07:00:00Z' }] })
    expect((await snapshots.getSnapshot(summary.hash)).entries[0]).toEqual({ fileId: 3, path: '合同.pdf', version: 'b'.repeat(64), uploader: '乙', uploadedAt: '2026-08-17T07:00:00Z' })
    next({ snapshot: 'c'.repeat(64), restored_files: 1, skipped: [{ file_id: 4, path: '缺失.pdf', reason: '源版本不存在' }] })
    await expect(snapshots.restoreSnapshot(summary.hash)).resolves.toEqual({ snapshot: 'c'.repeat(64), restoredFiles: 1, skipped: [{ fileId: 4, path: '缺失.pdf', reason: '源版本不存在' }] })
    expect(fetch).toHaveBeenLastCalledWith(`/api/v1/snapshots/${summary.hash}/restore`, expect.objectContaining({ method: 'POST', body: undefined }))
  })
})
