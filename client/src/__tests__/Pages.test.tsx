// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "../pages/Login";
import Statistics from "../pages/Statistics";
import RiskBoard from "../pages/RiskBoard";
import ResourceCenterPage from "../pages/ResourceCenterPage";
import ProjectDetail from "../pages/ProjectDetail";
import { adminApi, authApi, projectsApi, statisticsApi } from "../api";

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    authApi: { ...actual.authApi, login: vi.fn() },
    adminApi: {
      ...actual.adminApi,
      listUsers: vi.fn(),
      listProjectMembers: vi.fn(),
    },
    projectsApi: {
      ...actual.projectsApi,
      listProjects: vi.fn(),
      getProjectRisks: vi.fn(),
      getProject: vi.fn(),
      getCollectionOverview: vi.fn(),
      getRenewalChain: vi.fn(),
    },
    statisticsApi: { getStatisticsOverview: vi.fn() },
  };
});
vi.mock("../components/ChatArea", () => ({
  default: () => <div>聊天区域</div>,
}));
vi.mock("../components/CreateProjectModal", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div>
      创建弹窗<button onClick={onClose}>关闭弹窗</button>
    </div>
  ),
}));
vi.mock("../components/ResourceCenter", () => ({
  default: () => <div>资料中心内容</div>,
}));
vi.mock("../components/VersionHistory", () => ({
  default: () => <div>版本历史</div>,
}));
vi.mock("../components/TagPanel", () => ({
  default: () => <div>标签面板</div>,
}));
vi.mock("../components/ProcessFiles", () => ({
  default: () => <div>过程文件内容</div>,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(async () => {
  // 测试间隔离登录态：模块级 auth 状态需显式清空。
  const { setAuthToken } = await import("../api");
  setAuthToken(null);
  vi.mocked(adminApi.listUsers).mockResolvedValue([]);
  vi.mocked(adminApi.listProjectMembers).mockResolvedValue([]);
  vi.mocked(projectsApi.getRenewalChain).mockResolvedValue({
    project_id: 1,
    depth_limit: 20,
    items: [],
  });
});
const statisticsExtras = {
  projectTypeDistribution: { 软件销售: 1 },
  deliveryDeadlineDistribution: {
    overdue: 0,
    due_soon: 0,
    normal: 1,
    excluded: 0,
  },
  payment: {
    contractAmount: 100,
    invoicedAmount: 80,
    receivableAmount: 50,
    receivedAmount: 40,
    outstandingAmount: 60,
    overdueAmount: 10,
    collectionRate: 0.8,
    dataIncompleteProjects: 0,
  },
};
const emptyProjectList = { page: 1, size: 100, total: 0, items: [] };

describe("页面", () => {
  it("Login 成功登录并导航", async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      token: "t",
      expiresAt: "x",
      user: { id: 1, login: "u", name: "U", isAdmin: false },
    });
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/risk-board" element={<div>风险主页</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText("请输入账号"), " user ");
    await userEvent.type(screen.getByPlaceholderText("请输入密码"), "pw");
    await userEvent.click(screen.getByText("登录"));
    await screen.findByText("风险主页");
    expect(authApi.login).toHaveBeenCalledWith("user", "pw");
  });

  it("Login 显示接口与未知错误", async () => {
    const { ApiError } = await import("../api");
    vi.mocked(authApi.login)
      .mockRejectedValueOnce(new ApiError("凭据错误", "AUTH", 401))
      .mockRejectedValueOnce(new Error());
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );
    const account = screen.getByPlaceholderText("请输入账号");
    const password = screen.getByPlaceholderText("请输入密码");
    await userEvent.type(account, "u");
    await userEvent.type(password, "p");
    await userEvent.click(screen.getByText("登录"));
    await screen.findByText("凭据错误");
    await userEvent.click(screen.getByText("登录"));
    await screen.findByText("登录失败，请稍后重试");
  });

  it("Statistics 展示统计值、空指标和阶段", async () => {
    vi.mocked(statisticsApi.getStatisticsOverview).mockResolvedValue({
      projects: {
        total: 1,
        risks: { block: 1, warn: 0, ok: 0 },
        averageCostUsageRate: { value: 20, sampleCount: 1 },
        averageScheduleUsageRate: { value: null, sampleCount: 0 },
        averageSatisfaction: { value: 5, sampleCount: 1 },
      },
      files: {
        workspaceFileTotal: 2,
        deliverables: { missing: 1, old: 0, conflict: 0, ok: 1 },
      },
      byStage: [
        {
          stage: null,
          count: 1,
          averageCostUsageRate: { value: 20, sampleCount: 1 },
          averageScheduleUsageRate: { value: null, sampleCount: 0 },
          averageSatisfaction: { value: 5, sampleCount: 1 },
        },
      ],
      ...statisticsExtras,
    });
    vi.mocked(projectsApi.listProjects).mockResolvedValue(emptyProjectList);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Statistics />} />
          <Route path="/risk-board" element={<div>风险下钻</div>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("项目总数");
    expect(screen.getAllByText("20%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("未填写")).toBeTruthy();
    expect(screen.getByText("回款率")).toBeTruthy();
    expect(screen.getByText("软件销售")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /逾期金额/ }));
    await screen.findByText("风险下钻");
  });

  it("Statistics 处理空数据、错误和重试", async () => {
    vi.mocked(statisticsApi.getStatisticsOverview)
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce({
        projects: {
          total: 0,
          risks: { block: 0, warn: 0, ok: 0 },
          averageCostUsageRate: { value: null, sampleCount: 0 },
          averageScheduleUsageRate: { value: null, sampleCount: 0 },
          averageSatisfaction: { value: null, sampleCount: 0 },
        },
        files: {
          workspaceFileTotal: 0,
          deliverables: { missing: 0, old: 0, conflict: 0, ok: 0 },
        },
        byStage: [],
        projectTypeDistribution: {},
        deliveryDeadlineDistribution: {},
        payment: {
          ...statisticsExtras.payment,
          contractAmount: 0,
          invoicedAmount: 0,
          receivableAmount: 0,
          receivedAmount: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
          collectionRate: null,
        },
      });
    vi.mocked(projectsApi.listProjects).mockResolvedValue(emptyProjectList);
    render(
      <MemoryRouter>
        <Statistics />
      </MemoryRouter>,
    );
    await screen.findByText("统计数据加载失败，请稍后重试");
    await userEvent.click(screen.getByText("重新加载"));
    await screen.findByText(/暂无统计数据/);
    expect(screen.getByText("暂无项目阶段统计数据。")).toBeTruthy();
  });

  it("RiskBoard 加载、筛选项目并打开弹窗", async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue({
      page: 1,
      size: 100,
      total: 1,
      items: [
        {
          id: "1",
          name: "Alpha",
          code: "A",
          customerName: "客户",
          projectType: "软件销售",
          status: "active",
          progress: 10,
          contractAmount: null,
          signedDate: null,
          plannedDeliveryDate: null,
          updatedAt: "",
        },
      ],
    });
    vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({
      level: "warn",
      risks: [],
    });
    render(
      <MemoryRouter>
        <RiskBoard />
      </MemoryRouter>,
    );
    await screen.findByText("Alpha");
    expect(screen.getByText("共 1 个项目")).toBeTruthy();
    expect(screen.queryByText("A")).toBeNull();
    await userEvent.click(screen.getByTitle("点击只看阻塞"));
    expect(screen.getByText("未找到匹配项目")).toBeTruthy();
    await userEvent.click(screen.getByText("新建项目"));
    expect(screen.getByText("创建弹窗")).toBeTruthy();
    await userEvent.click(screen.getByText("关闭弹窗"));
  });

  it("RiskBoard 容忍单个风险失败并处理列表错误", async () => {
    vi.mocked(projectsApi.listProjects)
      .mockResolvedValueOnce({
        page: 1,
        size: 100,
        total: 1,
        items: [
          {
            id: "1",
            name: "Alpha",
            code: "A",
            customerName: "客户",
            projectType: "软件销售",
            status: "active",
            progress: 10,
            contractAmount: null,
            signedDate: null,
            plannedDeliveryDate: null,
            updatedAt: "",
          },
        ],
      })
      .mockRejectedValueOnce(new Error());
    vi.mocked(projectsApi.getProjectRisks).mockRejectedValue(new Error());
    render(
      <MemoryRouter>
        <RiskBoard />
      </MemoryRouter>,
    );
    await screen.findByText("Alpha");
    await userEvent.click(screen.getByText("刷新"));
    await screen.findByText("项目列表加载失败，请稍后重试");
  });

  it("ResourceCenterPage 挂载资料中心", () => {
    render(<ResourceCenterPage />);
    expect(screen.getByText("资料中心内容")).toBeTruthy();
  });

  it("ProjectDetail 挂载并展示项目核心条件", async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: "1",
      name: "详情项目",
      code: "P",
      customerName: "客户",
      projectType: "软件销售",
      parties: [],
      contractAmount: null,
      signedDate: null,
      startedDate: null,
      plannedDeliveryDate: null,
      status: "active",
      progress: 10,
      notes: null,
      deliverables: [],
      latestSummary: null,
    });
    vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({
      level: "warn",
      risks: [
        {
          type: "delivery-deadline",
          level: "warn",
          reason: "即将到期",
          recommendation: "跟进",
          remainingDays: 8,
          overdueDays: null,
          overdueAmount: null,
          dataStatus: "complete",
        },
      ],
    });
    vi.mocked(projectsApi.getCollectionOverview).mockResolvedValue({
      contractAmount: null,
      receivableAmount: 50,
      receivedAmount: 20,
      invoicedAmount: 80,
      overdueAmount: 30,
      collectionRate: 0.4,
      dataStatus: "ok",
      incompleteReasons: [],
    });
    render(
      <MemoryRouter initialEntries={["/projects/1"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getAllByText("详情项目")).toHaveLength(2),
    );
    expect(screen.queryByText("P")).toBeNull();
    expect(screen.getByText("交付节点 剩余 8 天")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "交付物" }));
    expect(screen.getByText("版本历史")).toBeTruthy();
    expect(screen.getByText("距交付 8 天")).toBeTruthy();
    expect(screen.getByText("本项目回款进度")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "标签" }));
    expect(screen.getByText("标签面板")).toBeTruthy();
  });

  it("ProjectDetail 仅管理员可见项目成员区块", async () => {
    const { setAuthToken } = await import("../api");
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: "1",
      name: "详情项目",
      code: "P",
      customerName: "客户",
      projectType: null,
      parties: [],
      contractAmount: null,
      signedDate: null,
      startedDate: null,
      plannedDeliveryDate: null,
      status: "active",
      progress: 0,
      notes: null,
      deliverables: [],
      latestSummary: null,
    });
    vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({
      level: "ok",
      risks: [],
    });
    vi.mocked(projectsApi.getCollectionOverview).mockResolvedValue({
      contractAmount: null,
      receivableAmount: 0,
      receivedAmount: 0,
      invoicedAmount: 0,
      overdueAmount: 0,
      collectionRate: null,
      dataStatus: "ok",
      incompleteReasons: [],
    });
    const routes = (
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetail />} />
      </Routes>
    );

    // 非管理员：不渲染项目成员标签
    setAuthToken("t", { id: 2, login: "u", name: "U", isAdmin: false });
    const first = render(
      <MemoryRouter initialEntries={["/projects/1"]}>{routes}</MemoryRouter>,
    );
    await screen.findAllByText("详情项目");
    expect(screen.queryByText("项目成员")).toBeNull();
    first.unmount();

    // 管理员：标签导航出现"项目成员"，点击后展示成员管理
    setAuthToken("t", { id: 1, login: "a", name: "A", isAdmin: true });
    render(
      <MemoryRouter initialEntries={["/projects/1"]}>{routes}</MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "项目成员" }),
    );
    await screen.findByText("暂无项目成员");
  });

  it("ProjectDetail 展示 incomplete 原因与真实回款进度", async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: "1",
      name: "详情项目",
      code: "P",
      customerName: "客户",
      projectType: "软件销售",
      parties: [],
      contractAmount: 1000,
      signedDate: null,
      startedDate: null,
      plannedDeliveryDate: null,
      status: "active",
      progress: 10,
      notes: null,
      deliverables: [],
      latestSummary: null,
    });
    vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({
      level: "warn",
      risks: [],
    });
    vi.mocked(projectsApi.getCollectionOverview).mockResolvedValue({
      contractAmount: 1000,
      receivableAmount: 500,
      receivedAmount: 125,
      invoicedAmount: 500,
      overdueAmount: 375,
      collectionRate: 0.25,
      dataStatus: "incomplete",
      incompleteReasons: ["缺少已解析合同"],
    });
    render(
      <MemoryRouter initialEntries={["/projects/1"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getAllByText("详情项目")).toHaveLength(2),
    );
    await userEvent.click(screen.getByRole("tab", { name: "交付物" }));
    await waitFor(() =>
      expect(screen.getByText("回款数据不完整：缺少已解析合同")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen.getByText("逾期金额 375.00 元，请尽快跟进回款"),
      ).toBeTruthy(),
    );
    const progress =
      screen.getByRole("progressbar") ?? screen.getByLabelText("回款进度 25%");
    expect((progress.firstElementChild as HTMLElement).style.width).toBe("25%");
  });

  it("ProjectDetail 展示续签链并跳转到关联项目", async () => {
    vi.mocked(projectsApi.getProject).mockResolvedValue({
      id: "1",
      name: "详情项目",
      code: "P",
      customerName: "客户",
      projectType: "软件销售",
      parties: [],
      contractAmount: null,
      signedDate: null,
      startedDate: null,
      plannedDeliveryDate: null,
      status: "active",
      progress: 10,
      notes: null,
      deliverables: [],
      latestSummary: null,
    });
    vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({
      level: "ok",
      risks: [],
    });
    vi.mocked(projectsApi.getCollectionOverview).mockResolvedValue({
      contractAmount: null,
      receivableAmount: 0,
      receivedAmount: 0,
      invoicedAmount: 0,
      overdueAmount: null,
      collectionRate: null,
      dataStatus: "ok",
      incompleteReasons: [],
    });
    vi.mocked(projectsApi.getRenewalChain).mockResolvedValue({
      project_id: 1,
      depth_limit: 20,
      items: [
        {
          id: 1,
          name: "详情项目",
          code: "P",
          customer_name: "客户",
          project_type: "软件销售",
          parties: [],
          contract_amount: null,
          signed_date: null,
          started_date: null,
          planned_delivery_date: null,
          status: "active",
          progress: 10,
          notes: null,
          created_at: "x",
          updated_at: "y",
          links: null,
        },
        {
          id: 2,
          name: "续签项目",
          code: "R",
          customer_name: "客户",
          project_type: "软件销售",
          parties: [],
          contract_amount: null,
          signed_date: "2026-01-01",
          started_date: null,
          planned_delivery_date: null,
          status: "active",
          progress: 0,
          notes: null,
          created_at: "y",
          updated_at: "z",
          links: null,
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/projects/1"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getAllByText("详情项目").length).toBeGreaterThanOrEqual(2),
    );
    await waitFor(() => expect(screen.getByText("续签链")).toBeTruthy());
    const link = screen.getByRole("link", { name: "续签项目" });
    expect(link.getAttribute("href")).toBe("/projects/2");
  });
});
