// 前端路由路径集中定义，避免字符串散落各处。
export const ROUTES = {
  login: "/login",
  riskBoard: "/risk-board",
  resourceCenter: "/resource-center",
  statistics: "/statistics",
  admin: "/admin",
  project: (id: string | number) => `/projects/${id}`,
} as const;
