// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Login from '../pages/Login'
import Statistics from '../pages/Statistics'
import RiskBoard from '../pages/RiskBoard'
import ResourceCenterPage from '../pages/ResourceCenterPage'
import ProjectDetail from '../pages/ProjectDetail'
import { authApi, projectsApi, statisticsApi } from '../api'

vi.mock('../api', async (original) => { const actual = await original<typeof import('../api')>(); return { ...actual, authApi: { ...actual.authApi, login: vi.fn() }, projectsApi: { ...actual.projectsApi, listProjects: vi.fn(), getProjectRisks: vi.fn(), getProject: vi.fn() }, statisticsApi: { getStatisticsOverview: vi.fn() } } })
vi.mock('../components/ChatArea', () => ({ default: () => <div>聊天区域</div> }))
vi.mock('../components/CreateProjectModal', () => ({ default: ({ onClose }: { onClose: () => void }) => <div>创建弹窗<button onClick={onClose}>关闭弹窗</button></div> }))
vi.mock('../components/ResourceCenter', () => ({ default: () => <div>资料中心内容</div> }))
vi.mock('../components/VersionHistory', () => ({ default: () => <div>版本历史</div> }))
vi.mock('../components/TagPanel', () => ({ default: () => <div>标签面板</div> }))
vi.mock('../components/ProcessFiles', () => ({ default: () => <div>过程文件内容</div> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('页面', () => {
  it('Login 成功登录并导航', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ token: 't', expiresAt: 'x', user: { id: 1, login: 'u', name: 'U', isAdmin: false } })
    render(<MemoryRouter initialEntries={['/login']}><Routes><Route path="/login" element={<Login />} /><Route path="/risk-board" element={<div>风险主页</div>} /></Routes></MemoryRouter>)
    await userEvent.type(screen.getByPlaceholderText('请输入账号'), ' user '); await userEvent.type(screen.getByPlaceholderText('请输入密码'), 'pw'); await userEvent.click(screen.getByText('登录')); await screen.findByText('风险主页'); expect(authApi.login).toHaveBeenCalledWith('user', 'pw')
  })

  it('Login 显示接口与未知错误', async () => {
    const { ApiError } = await import('../api'); vi.mocked(authApi.login).mockRejectedValueOnce(new ApiError('凭据错误', 'AUTH', 401)).mockRejectedValueOnce(new Error())
    render(<MemoryRouter><Login /></MemoryRouter>); const account = screen.getByPlaceholderText('请输入账号'); const password = screen.getByPlaceholderText('请输入密码'); await userEvent.type(account, 'u'); await userEvent.type(password, 'p'); await userEvent.click(screen.getByText('登录')); await screen.findByText('凭据错误'); await userEvent.click(screen.getByText('登录')); await screen.findByText('登录失败，请稍后重试')
  })

  it('Statistics 展示统计值、空指标和阶段', async () => {
    vi.mocked(statisticsApi.getStatisticsOverview).mockResolvedValue({ projects: { total: 1, risks: { block: 1, warn: 0, ok: 0 }, averageCostUsageRate: { value: 20, sampleCount: 1 }, averageScheduleUsageRate: { value: null, sampleCount: 0 }, averageSatisfaction: { value: 5, sampleCount: 1 } }, files: { workspaceFileTotal: 2, deliverables: { missing: 1, old: 0, conflict: 0, ok: 1 } }, byStage: [{ stage: null, count: 1, averageCostUsageRate: { value: 20, sampleCount: 1 }, averageScheduleUsageRate: { value: null, sampleCount: 0 }, averageSatisfaction: { value: 5, sampleCount: 1 } }] })
    render(<Statistics />); await screen.findByText('项目总数'); expect(screen.getAllByText('20%').length).toBeGreaterThan(0); expect(screen.getByText('暂无数据')).toBeTruthy(); expect(screen.getByText('未填写')).toBeTruthy()
  })

  it('Statistics 处理空数据、错误和重试', async () => {
    vi.mocked(statisticsApi.getStatisticsOverview).mockRejectedValueOnce(new Error()).mockResolvedValueOnce({ projects: { total: 0, risks: { block: 0, warn: 0, ok: 0 }, averageCostUsageRate: { value: null, sampleCount: 0 }, averageScheduleUsageRate: { value: null, sampleCount: 0 }, averageSatisfaction: { value: null, sampleCount: 0 } }, files: { workspaceFileTotal: 0, deliverables: { missing: 0, old: 0, conflict: 0, ok: 0 } }, byStage: [] })
    render(<Statistics />); await screen.findByText('统计数据加载失败，请稍后重试'); await userEvent.click(screen.getByText('重新加载')); await screen.findByText(/暂无统计数据/); expect(screen.getByText('暂无项目阶段统计数据。')).toBeTruthy()
  })

  it('RiskBoard 加载、筛选项目并打开弹窗', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue({ page: 1, size: 100, total: 1, items: [{ id: '1', name: 'Alpha', code: 'A', customerName: '客户', projectType: '软件销售', status: 'active', progress: 10, contractAmount: null, signedDate: null, plannedDeliveryDate: null, updatedAt: '' }] }); vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({ level: 'warn', risks: [] })
    render(<MemoryRouter><RiskBoard /></MemoryRouter>); await screen.findByText('Alpha'); expect(screen.getByText('共 1 个项目')).toBeTruthy(); await userEvent.click(screen.getByTitle('点击只看阻塞级项目')); expect(screen.getByText('当前筛选条件下暂无项目。')).toBeTruthy(); await userEvent.click(screen.getByText('新建项目')); expect(screen.getByText('创建弹窗')).toBeTruthy(); await userEvent.click(screen.getByText('关闭弹窗'))
  })

  it('RiskBoard 容忍单个风险失败并处理列表错误', async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValueOnce({ page: 1, size: 100, total: 1, items: [{ id: '1', name: 'Alpha', code: 'A', customerName: '客户', projectType: '软件销售', status: 'active', progress: 10, contractAmount: null, signedDate: null, plannedDeliveryDate: null, updatedAt: '' }] }).mockRejectedValueOnce(new Error()); vi.mocked(projectsApi.getProjectRisks).mockRejectedValue(new Error())
    render(<MemoryRouter><RiskBoard /></MemoryRouter>); await screen.findByText('Alpha'); await userEvent.click(screen.getByText('刷新')); await screen.findByText('项目列表加载失败，请稍后重试')
  })

  it('ResourceCenterPage 挂载资料中心', () => { render(<ResourceCenterPage />); expect(screen.getByText('资料中心内容')).toBeTruthy() })

  it('ProjectDetail 挂载并展示项目核心条件', async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue({ id: '1', name: '详情项目', code: 'P', customerName: '客户', projectType: '软件销售', parties: [], contractAmount: null, signedDate: null, startedDate: null, plannedDeliveryDate: null, status: 'active', progress: 10, notes: null, deliverables: [], latestSummary: null })
    render(<MemoryRouter initialEntries={['/projects/1']}><Routes><Route path="/projects/:id" element={<ProjectDetail />} /></Routes></MemoryRouter>); await waitFor(() => expect(screen.getAllByText('详情项目')).toHaveLength(2)); expect(screen.getByText('版本历史')).toBeTruthy(); expect(screen.getByText('标签面板')).toBeTruthy()
  })
})
