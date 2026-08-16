// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Header from '../components/Header'
import ProjectCard from '../components/ProjectCard'
import RiskFilter from '../components/RiskFilter'
import ChatArea from '../components/ChatArea'
import VersionHistory from '../components/VersionHistory'
import TagPanel from '../components/TagPanel'
import { aiApi, deliverablesApi, filesApi, setAuthToken, tagsApi } from '../api'

vi.mock('../api', async (original) => { const actual = await original<typeof import('../api')>(); return { ...actual, aiApi: { ...actual.aiApi, askCopilot: vi.fn(), getTask: vi.fn(), getExtraction: vi.fn(), createExtractionTask: vi.fn() }, deliverablesApi: { ...actual.deliverablesApi, listTrackedFiles: vi.fn() }, filesApi: { ...actual.filesApi, listProjectFiles: vi.fn(), listFileVersionOptions: vi.fn(), downloadVersion: vi.fn() }, tagsApi: { ...actual.tagsApi, listTags: vi.fn(), createTag: vi.fn(), listTagSnapshots: vi.fn(), createTagSnapshot: vi.fn() } } })
afterEach(() => { cleanup(); vi.clearAllMocks() })
const route = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)

describe('核心组件', () => {
  it('Header 展示默认与自定义副标题并退出', async () => {
    setAuthToken('t', { id: 1, login: 'u', name: 'U', isAdmin: false }); const { rerender } = route(<Header />)
    expect(screen.getByText(/项目风险与经营分析助手/)).toBeTruthy(); await userEvent.click(screen.getByText('退出'))
    rerender(<MemoryRouter><Header subtitle="自定义" /></MemoryRouter>); expect(screen.getByText('自定义')).toBeTruthy()
  })

  it('ProjectCard 映射状态、缺省字段、风险与进度', () => {
    route(<ProjectCard project={{ id: '2', name: 'Alpha', code: 'A', customerName: '客户', projectType: '软件销售', status: 'active', progress: 42, contractAmount: null, signedDate: null, plannedDeliveryDate: null, updatedAt: '', riskLevel: 'warn', risks: [{ type: 'delivery-deadline', level: 'warn', reason: '', recommendation: '', remainingDays: 9, overdueDays: null, overdueAmount: null, dataStatus: 'complete' }, { type: 'payment-overdue', level: 'warn', reason: '', recommendation: '', remainingDays: null, overdueDays: 5, overdueAmount: 1234.5, dataStatus: 'complete' }] }} />)
    expect(screen.getByText('Alpha')).toBeTruthy(); expect(screen.getByText('软件销售')).toBeTruthy(); expect(screen.getByText('预警')).toBeTruthy(); expect(screen.getByText(/合同金额：未填写/).textContent?.match(/未填写/g)).toHaveLength(3); expect(screen.getByLabelText('项目进度 42%')).toBeTruthy(); expect(screen.getByText('距交付 9 天')).toBeTruthy(); expect(screen.getByText(/1,234.50 元/)).toBeTruthy()
  })

  it('ProjectCard 将数据不完整单独标识', () => {
    route(<ProjectCard project={{ id: '3', name: 'Beta', code: 'B', customerName: '客户', projectType: null, status: 'active', progress: 0, contractAmount: 1000, signedDate: null, plannedDeliveryDate: null, updatedAt: '', riskLevel: 'warn', risks: [{ type: 'payment-data-incomplete', level: 'warn', reason: '', recommendation: '', remainingDays: null, overdueDays: null, overdueAmount: null, dataStatus: 'incomplete' }] }} />)
    expect(screen.getByText('数据不完整')).toBeTruthy(); expect(screen.queryByText('预警')).toBeNull()
  })

  it('RiskFilter 点击筛选并再次点击恢复全部', async () => {
    const change = vi.fn(); const { rerender } = render(<RiskFilter blockCount={1} warnCount={2} okCount={3} totalCount={6} deliveryCount={1} paymentCount={1} incompleteCount={1} active="all" onChange={change} />)
    await userEvent.click(screen.getByTitle('点击只看阻塞级项目')); expect(change).toHaveBeenCalledWith('block')
    rerender(<RiskFilter blockCount={1} warnCount={2} okCount={3} totalCount={6} deliveryCount={1} paymentCount={1} incompleteCount={1} active="block" onChange={change} />); await userEvent.click(screen.getByTitle('点击只看阻塞级项目')); expect(change).toHaveBeenLastCalledWith('all')
  })

  it('ChatArea 加载欢迎答复并发送输入与快捷问题', async () => {
    vi.mocked(aiApi.askCopilot).mockResolvedValueOnce({ answer: '欢迎回答', references: ['合同'] }).mockResolvedValueOnce({ answer: '第二答复', references: [] }).mockResolvedValueOnce({ answer: '快捷答复', references: [] })
    route(<ChatArea projectId={3} />); expect(screen.getByText('思考中…')).toBeTruthy(); await screen.findByText('欢迎回答'); expect(screen.getByText('合同')).toBeTruthy()
    const input = screen.getByPlaceholderText('输入问题...'); await userEvent.type(input, ' 问题 '); await userEvent.click(screen.getByText('发送')); await screen.findByText('第二答复')
    await userEvent.click(screen.getByText('本周关键节点')); await screen.findByText('快捷答复')
  })

  it('ChatArea 初始失败显示兜底，发送失败显示 ApiError', async () => {
    const { ApiError } = await import('../api'); vi.mocked(aiApi.askCopilot).mockRejectedValueOnce(new Error()).mockRejectedValueOnce(new ApiError('接口失败', 'X', 500))
    route(<ChatArea />); await screen.findByText(/你好，我是/); const input = screen.getByPlaceholderText('输入问题...'); await userEvent.type(input, '问题'); fireEvent.keyDown(input, { key: 'Enter' }); await screen.findByText('接口失败')
  })

  it('VersionHistory 展示空状态、版本和格式化数据', async () => {
    const { rerender } = render(<VersionHistory projectId={1} deliverables={[]} />); expect(screen.getByText('暂无交付物')).toBeTruthy()
    vi.mocked(deliverablesApi.listTrackedFiles).mockResolvedValue([{ id: '1', sourceFileId: 5, name: '合同', category: '合同', required: true, currentVersion: 'abcdefghijk', status: 'ok', versions: [{ version: 'abcdefghijk', previousVersion: null, uploadedBy: '', changelog: '', parseStatus: 'done', documentType: null, sizeBytes: 2048, isFrozen: true, isCurrent: true, uploadedAt: '2026-01-01T00:00:00Z' }] }])
    rerender(<VersionHistory projectId={1} deliverables={[{ id: '5', name: '合同', createdAt: '', updatedAt: '2026-01-01T00:00:00Z' }]} />); await userEvent.click(screen.getByText('展开')); await screen.findByText('当前生效'); expect(screen.getByText('已冻结')).toBeTruthy(); expect(screen.getByText('2.0 KB')).toBeTruthy(); expect(screen.getAllByText('无').length).toBeGreaterThan(0)
  })

  it('VersionHistory 处理加载错误和无对应历史', async () => {
    vi.mocked(deliverablesApi.listTrackedFiles).mockRejectedValueOnce(new Error()); route(<VersionHistory projectId={1} deliverables={[{ id: '5', name: '合同', createdAt: '', updatedAt: '2026-01-01T00:00:00Z' }]} />)
    await userEvent.click(screen.getByText('展开')); await screen.findByText('版本历史加载失败，请稍后重试')
    vi.mocked(deliverablesApi.listTrackedFiles).mockResolvedValueOnce([]); await userEvent.click(screen.getByText('重试')); await screen.findByText('暂无版本历史')
  })

  it('VersionHistory 通过 blob 下载版本并处理失败', async () => {
    vi.mocked(deliverablesApi.listTrackedFiles).mockResolvedValue([{ id: '1', sourceFileId: 5, name: '合同', category: '合同', required: true, currentVersion: 'abcdefghijk', status: 'ok', versions: [{ version: 'abcdefghijk', previousVersion: null, uploadedBy: '', changelog: '', parseStatus: 'done', documentType: null, sizeBytes: 2048, isFrozen: true, isCurrent: true, uploadedAt: '2026-01-01T00:00:00Z' }] }])
    vi.mocked(filesApi.downloadVersion).mockResolvedValueOnce({ blob: new Blob(['x']), filename: 'report.pdf' })
    const createObjectURL = vi.spyOn(globalThis.URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeObjectURL = vi.spyOn(globalThis.URL, 'revokeObjectURL').mockImplementation(() => {})
    render(<VersionHistory projectId={1} deliverables={[{ id: '5', name: '合同', createdAt: '', updatedAt: '2026-01-01T00:00:00Z' }]} />)
    await userEvent.click(screen.getByText('展开'))
    await screen.findByText('当前生效')
    await userEvent.click(screen.getByText('下载'))
    await waitFor(() => expect(filesApi.downloadVersion).toHaveBeenCalledWith('abcdefghijk'))
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    createObjectURL.mockRestore(); revokeObjectURL.mockRestore()
    vi.mocked(filesApi.downloadVersion).mockRejectedValueOnce(new Error('下载失败'))
    await userEvent.click(screen.getByText('下载'))
    await screen.findByText('下载失败，请稍后重试')
  })

  it('TagPanel 加载空状态、校验并创建标签', async () => {
    setAuthToken('t', { id: 1, login: 'u', name: '测试员', isAdmin: false }); vi.mocked(tagsApi.listTags).mockResolvedValue([]); vi.mocked(filesApi.listProjectFiles).mockResolvedValue([]); vi.mocked(tagsApi.createTag).mockResolvedValue({} as never)
    render(<TagPanel projectId={2} />); await screen.findByText('暂无标签'); expect(screen.getByDisplayValue('测试员')).toBeTruthy(); await userEvent.click(screen.getByText('新建标签')); expect(screen.getByRole('alert').textContent).toContain('请输入标签名称')
    await userEvent.type(screen.getByLabelText('标签名称'), ' 标签 '); await userEvent.type(screen.getByPlaceholderText('选填'), '备注'); await userEvent.click(screen.getByText('新建标签')); await waitFor(() => expect(tagsApi.createTag).toHaveBeenCalledWith(2, { name: '标签', type: 'demo', note: '备注' }))
  })

  it('TagPanel 展开标签并创建快照', async () => {
    vi.mocked(tagsApi.listTags).mockResolvedValue([{ id: 1, name: '里程碑', type: 'report', createdBy: 'U', note: null, createdAt: '2026-01-01T00:00:00Z' }]); vi.mocked(filesApi.listProjectFiles).mockResolvedValue([{ id: 3, name: '合同', isDeliverable: true, createdAt: '', updatedAt: '', latestVersion: null }]); vi.mocked(tagsApi.listTagSnapshots).mockResolvedValue([]); vi.mocked(filesApi.listFileVersionOptions).mockResolvedValue(['version123']); vi.mocked(tagsApi.createTagSnapshot).mockResolvedValue({} as never)
    render(<TagPanel projectId={2} />); await screen.findByText('里程碑'); await userEvent.click(screen.getByText('展开')); await screen.findByText('暂无快照'); await userEvent.selectOptions(screen.getByLabelText('选择项目文件'), '3'); await waitFor(() => expect((screen.getByLabelText('选择文件版本') as HTMLSelectElement).value).toBe('version123')); await userEvent.click(screen.getByText('添加快照')); await waitFor(() => expect(tagsApi.createTagSnapshot).toHaveBeenCalled())
  })
})
