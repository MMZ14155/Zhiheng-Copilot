// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Admin from '../pages/Admin'
import CreateProjectModal from '../components/CreateProjectModal'
import { adminApi, projectsApi } from '../api'

vi.mock('../api', async (original) => {
  const actual = await original<typeof import('../api')>()
  return {
    ...actual,
    adminApi: {
      listUsers: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(),
      listProjectMembers: vi.fn(), assignMember: vi.fn(), removeMember: vi.fn(),
    },
    projectsApi: { ...actual.projectsApi, listProjects: vi.fn(), createProject: vi.fn() },
  }
})

const project = { id: '7', name: '示例项目', code: 'P-7', customerName: '客户', projectType: null, status: 'active' as const, progress: 0, contractAmount: null, signedDate: null, plannedDeliveryDate: null, updatedAt: '' }

describe('管理页与项目创建', () => {
  beforeEach(() => {
    vi.mocked(adminApi.listUsers).mockResolvedValue([{ id: 1, login: 'admin', name: '管理员', isAdmin: true, createdAt: '2026-08-17T00:00:00Z' }])
    vi.mocked(adminApi.listProjectMembers).mockResolvedValue([{ userId: 1, login: 'admin', name: '管理员', role: 'manager' }])
    vi.mocked(adminApi.deleteUser).mockResolvedValue(undefined)
    vi.mocked(projectsApi.listProjects).mockResolvedValue({ page: 1, size: 100, total: 1, items: [project] })
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('渲染账号表格并经二次确认删除账号', async () => {
    render(<MemoryRouter><Admin /></MemoryRouter>)
    await screen.findByRole('table', { name: '账号列表' })
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('管理员').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('dialog', { name: '确认删除账号' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(adminApi.deleteUser).toHaveBeenCalledWith(1))
  })

  it('创建项目不再渲染编号输入且提交体不含 code', async () => {
    vi.mocked(projectsApi.createProject).mockResolvedValue({} as never)
    const close = vi.fn(); const created = vi.fn()
    render(<CreateProjectModal onClose={close} onCreated={created} />)
    expect(screen.queryByText('项目编号')).toBeNull()
    await userEvent.type(screen.getByText('项目名称').parentElement!.querySelector('input')!, '新项目')
    await userEvent.type(screen.getByText('客户名称').parentElement!.querySelector('input')!, '新客户')
    await userEvent.click(screen.getByRole('button', { name: '创建项目' }))
    await waitFor(() => expect(projectsApi.createProject).toHaveBeenCalled())
    expect(projectsApi.createProject).toHaveBeenCalledWith(expect.not.objectContaining({ code: expect.anything() }))
    expect(close).toHaveBeenCalled()
  })
})
