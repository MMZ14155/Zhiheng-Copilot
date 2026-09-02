// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Admin from "../pages/Admin";
import CreateProjectModal from "../components/CreateProjectModal";
import { adminApi, projectsApi } from "../api";

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    adminApi: {
      listUsers: vi.fn(),
      createUser: vi.fn(),
      deleteUser: vi.fn(),
      listProjectMembers: vi.fn(),
      assignMember: vi.fn(),
      removeMember: vi.fn(),
      getLlmConfig: vi.fn(),
      updateLlmConfig: vi.fn(),
      testLlmConfig: vi.fn(),
    },
    projectsApi: {
      ...actual.projectsApi,
      listProjects: vi.fn(),
      createProject: vi.fn(),
    },
  };
});

const project = {
  id: "7",
  name: "示例项目",
  code: "P-7",
  customerName: "客户",
  projectType: null,
  status: "项目启动" as const,
  contractAmount: null,
  signedDate: null,
  plannedDeliveryDate: null,
  updatedAt: "",
  region: null,
};
const llmConfig = {
  provider: "kimi",
  baseUrl: "https://api.moonshot.cn/v1",
  model: "kimi-k2.5",
  timeoutSeconds: 60,
  inputPricePerMtok: "4",
  outputPricePerMtok: "16",
  apiKeySet: true,
  apiKeyMasked: "****5678",
  source: "db" as const,
};

describe("管理页与项目创建", () => {
  beforeEach(() => {
    vi.mocked(adminApi.listUsers).mockResolvedValue([
      {
        id: 1,
        login: "admin",
        name: "管理员",
        isAdmin: true,
        createdAt: "2026-08-17T00:00:00Z",
      },
    ]);
    vi.mocked(adminApi.listProjectMembers).mockResolvedValue([
      { userId: 1, login: "admin", name: "管理员", role: "manager" },
    ]);
    vi.mocked(adminApi.deleteUser).mockResolvedValue(undefined);
    vi.mocked(adminApi.getLlmConfig).mockResolvedValue(llmConfig);
    vi.mocked(adminApi.updateLlmConfig).mockResolvedValue(llmConfig);
    vi.mocked(adminApi.testLlmConfig).mockResolvedValue({
      ok: true,
      detail: "LLM 配置连接成功",
    });
    vi.mocked(projectsApi.listProjects).mockResolvedValue({
      page: 1,
      size: 100,
      total: 1,
      items: [{
        ...project,
        region: null,
      }],
    });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("渲染账号表格并经二次确认删除账号", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    await screen.findByRole("table", { name: "账号列表" });
    expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("管理员").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("dialog", { name: "确认删除账号" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(adminApi.deleteUser).toHaveBeenCalledWith(1));
  });

  it("创建项目不再渲染编号输入且提交体不含 code", async () => {
    vi.mocked(projectsApi.createProject).mockResolvedValue({} as never);
    const close = vi.fn();
    const created = vi.fn();
    render(<CreateProjectModal onClose={close} onCreated={created} />);
    expect(screen.queryByText("项目编号")).toBeNull();
    await userEvent.type(
      screen.getByText("项目名称").parentElement!.querySelector("input")!,
      "新项目",
    );
    await userEvent.type(
      screen.getByText("客户名称").parentElement!.querySelector("input")!,
      "新客户",
    );
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    await waitFor(() => expect(projectsApi.createProject).toHaveBeenCalled());
    expect(projectsApi.createProject).toHaveBeenCalledWith(
      expect.not.objectContaining({ code: expect.anything() }),
    );
    expect(close).toHaveBeenCalled();
  });

  it("AI 配置仅回显掩码且留空保存不提交 apiKey", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "AI 配置" }),
    );
    const keyInput = (await screen.findByLabelText(
      "API Key",
    )) as HTMLInputElement;
    expect(keyInput.type).toBe("password");
    expect(keyInput.value).toBe("");
    expect(keyInput.placeholder).toBe("****5678");
    expect(screen.getByText(/当前 Key \*\*\*\*5678/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(adminApi.updateLlmConfig).toHaveBeenCalled());
    expect(adminApi.updateLlmConfig).toHaveBeenCalledWith(
      expect.not.objectContaining({ apiKey: expect.anything() }),
    );
  });

  it("AI 配置连接测试展示服务端结果", async () => {
    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("tab", { name: "AI 配置" }),
    );
    await screen.findByLabelText("API Key");
    await userEvent.click(screen.getByRole("button", { name: "测试连接" }));
    expect(await screen.findByText("LLM 配置连接成功")).toBeTruthy();
  });
});
