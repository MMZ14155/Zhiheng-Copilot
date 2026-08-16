import { describe, it, expect, beforeEach } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { setAuthToken } from '../api'

// App 登录守卫冒烟测试：通过 SSR 渲染验证有无令牌两种状态下的页面结构。
describe('App 登录守卫', () => {
  beforeEach(() => { setAuthToken(null) })

  it('无令牌时渲染登录页并提示刷新后需重新登录', () => {
    const html = renderToString(createElement(MemoryRouter, { initialEntries: ['/login'] }, createElement(App)))
    expect(html).toContain('智衡 Copilot')
    expect(html).toContain('登录')
    expect(html).toContain('刷新页面后需重新登录')
  })

  it('无令牌访问其他路径时跳转登录页', () => {
    const html = renderToString(createElement(MemoryRouter, { initialEntries: ['/statistics'] }, createElement(App)))
    expect(html).not.toContain('app-header')
  })

  it('有令牌时渲染应用布局与导航', () => {
    setAuthToken('token-1', { id: 2, login: 'demo', name: '演示用户', isAdmin: false })
    const html = renderToString(createElement(MemoryRouter, { initialEntries: ['/risk-board'] }, createElement(App)))
    expect(html).toContain('app-header')
    expect(html).toContain('项目首页')
  })
})
