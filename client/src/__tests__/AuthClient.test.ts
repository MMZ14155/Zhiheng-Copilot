import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { jsonRequest, setAuthToken, getAuthToken, getAuthUser, ApiError } from '../api/client'
import { authApi } from '../api'

// api 层令牌行为测试：验证 Authorization 头注入、401 清空令牌与 authApi 契约映射。
// 注：服务端用户对象字段为 is_admin（与后端 UserResponse 对齐），非云端初稿的 role。
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('api 令牌钩子与 authApi', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    setAuthToken(null)
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => { vi.unstubAllGlobals() })

  it('设置令牌后请求自动携带 Authorization Bearer 头', async () => {
    setAuthToken('token-abc', { id: 2, login: 'demo', name: '演示用户', isAdmin: false })
    fetchMock.mockResolvedValue(jsonResponse(200, { page: 1, size: 20, total: 0, items: [] }))
    await jsonRequest('/projects')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
  })

  it('未设置令牌时请求不携带 Authorization 头', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await jsonRequest('/health')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('401 响应清空内存令牌与当前用户', async () => {
    setAuthToken('expired', { id: 2, login: 'demo', name: '演示用户', isAdmin: false })
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: '未认证或令牌已失效', code: 'UNAUTHORIZED' }))
    await expect(jsonRequest('/projects')).rejects.toBeInstanceOf(ApiError)
    expect(getAuthToken()).toBeNull()
    expect(getAuthUser()).toBeNull()
  })

  it('authApi.login 提交账号密码并映射令牌与用户信息', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {
      token: 'token-demo',
      expires_at: '2026-08-17T00:00:00Z',
      user: { id: 2, login: 'demo', name: '演示用户', is_admin: false },
    }))
    const session = await authApi.login('demo', 'demo-dev-only')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ login: 'demo', password: 'demo-dev-only' })
    expect(session.token).toBe('token-demo')
    expect(session.user.name).toBe('演示用户')
    expect(session.user.isAdmin).toBe(false)
  })

  it('登录失败时抛出服务端 detail 作为错误信息', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: '用户名或密码错误', code: 'UNAUTHORIZED' }))
    await expect(authApi.login('demo', 'wrong')).rejects.toMatchObject({ message: '用户名或密码错误', code: 'UNAUTHORIZED', status: 401 })
  })

  it('authApi.me 返回当前用户姓名', async () => {
    setAuthToken('token-demo')
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 2, login: 'demo', name: '演示用户', is_admin: false }))
    const user = await authApi.me()
    expect(user.name).toBe('演示用户')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-demo')
  })

  it('authApi.changePassword 按接口字段提交原密码与新密码', async () => {
    setAuthToken('token-demo', { id: 2, login: 'demo', name: '演示用户', isAdmin: false })
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await authApi.changePassword('old-password', 'new-password')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/auth/change-password')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ old_password: 'old-password', new_password: 'new-password' })
  })

  it('修改密码 401 原样透传 detail 并保留会话以便界面展示', async () => {
    setAuthToken('token-demo', { id: 2, login: 'demo', name: '演示用户', isAdmin: false })
    fetchMock.mockResolvedValue(jsonResponse(401, { detail: '原密码错误', code: 'UNAUTHORIZED' }))
    await expect(authApi.changePassword('wrong-old', 'new-password')).rejects.toMatchObject({ message: '原密码错误', status: 401 })
    expect(getAuthToken()).toBe('token-demo')
  })
})
