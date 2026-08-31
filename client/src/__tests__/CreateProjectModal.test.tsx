// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateProjectModal from "../components/CreateProjectModal";
import { aiApi, projectsApi } from "../api";
import type { ProjectDraft } from "../api/models";

const draft: ProjectDraft = {
  name: "AI 识别项目",
  customerName: "AI 客户",
  parties: [{ role: "甲方", name: "甲方公司", contact: "138" }],
  contractAmount: "120000",
  signedDate: "2026-01-01",
  startedDate: "2026-02-01",
  plannedDeliveryDate: "",
  projectType: "软件销售",
  missingFields: ["planned_delivery_date"],
  notes: "合同备注",
};

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    aiApi: {
      ...actual.aiApi,
      analyzeProjectDraft: vi.fn(),
      getProjectDraftTask: vi.fn(),
    },
    projectsApi: {
      ...actual.projectsApi,
      listProjects: vi.fn(),
      createProject: vi.fn(),
    },
  };
});

const fieldInput = (label: string) =>
  screen
    .getByText(label)
    .parentElement!.querySelector("input,select,textarea") as HTMLInputElement;

const uploadAndAnalyze = async () => {
  await userEvent.upload(
    screen.getByLabelText("选择合同文件"),
    new File(["pdf"], "合同.pdf", { type: "application/pdf" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "开始分析" }));
};

const task = { task_id: 1, status: "pending" as const };

describe("CreateProjectModal AI 合同分析模式", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectsApi.listProjects).mockResolvedValue({
      page: 1,
      size: 1000,
      total: 0,
      items: [],
    });
    vi.mocked(aiApi.analyzeProjectDraft).mockResolvedValue(task);
    vi.mocked(aiApi.getProjectDraftTask).mockResolvedValue({
      status: "completed",
      stage: "completed",
      progress: 100,
      failureReason: null,
      rawOutput: null,
      draft,
    });
  });
  afterEach(() => cleanup());

  it("默认进入 AI 模式且表单字段可见", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    expect(
      screen
        .getByRole("tab", { name: "AI 合同分析" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByRole("tab", { name: "手动填写" })
        .getAttribute("aria-selected"),
    ).toBe("false");
    expect(screen.getByRole("button", { name: "开始分析" })).toBeTruthy();
    expect(screen.getByText("项目名称")).toBeTruthy();
  });

  it("分析成功后回填各表单字段", async () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    await uploadAndAnalyze();
    await waitFor(() =>
      expect(fieldInput("项目名称").value).toBe("AI 识别项目"),
    );
    expect(fieldInput("客户名称").value).toBe("AI 客户");
    expect(fieldInput("项目类型").value).toBe("软件销售");
    expect(fieldInput("合同金额").value).toBe("120000");
    expect(fieldInput("签约日期").value).toBe("2026-01-01");
    expect(fieldInput("启动日期").value).toBe("2026-02-01");
    expect(fieldInput("计划交付日期").value).toBe("");
    expect(
      (
        screen
          .getByText("备注")
          .parentElement!.querySelector("textarea") as HTMLTextAreaElement
      ).value,
    ).toBe("合同备注");
    expect(screen.getByDisplayValue("甲方公司")).toBeTruthy();
    expect(vi.mocked(aiApi.analyzeProjectDraft)).toHaveBeenCalledTimes(1);
  });

  it("展示 missing_fields 缺失字段提示条", async () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    await uploadAndAnalyze();
    const banner = await screen.findByText(/以下字段未能从合同识别，请补充/);
    expect(banner.textContent).toContain("计划交付日期");
  });

  it("分析失败展示服务端 detail 并可重试", async () => {
    const { ApiError } = await import("../api");
    vi.mocked(aiApi.analyzeProjectDraft).mockRejectedValueOnce(
      new ApiError("合同解析失败", "PARSE_ERROR", 422),
    );
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    await uploadAndAnalyze();
    expect(await screen.findByText("合同解析失败")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(fieldInput("项目名称").value).toBe("AI 识别项目"),
    );
  });

  it("模型返回值异常时展示原始返回值", async () => {
    vi.mocked(aiApi.getProjectDraftTask).mockResolvedValue({
      status: "failed",
      stage: "generating",
      progress: 80,
      failureReason: "返回内容不符合预期结构",
      rawOutput: '{"name": "异常返回"}',
      draft: null,
    });
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    await uploadAndAnalyze();
    expect(await screen.findByText("返回内容不符合预期结构")).toBeTruthy();
    expect(await screen.findByText("模型原始返回值")).toBeTruthy();
    expect(await screen.findByText('{"name": "异常返回"}')).toBeTruthy();
  });

  it("模式切换共享同一份表单值且不清空", async () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    await userEvent.type(fieldInput("项目名称"), "手动名称");
    await userEvent.click(screen.getByRole("tab", { name: "手动填写" }));
    expect(screen.queryByRole("button", { name: "开始分析" })).toBeNull();
    expect(fieldInput("项目名称").value).toBe("手动名称");
    await userEvent.type(fieldInput("客户名称"), "手动客户");
    await userEvent.click(screen.getByRole("tab", { name: "AI 合同分析" }));
    expect(fieldInput("项目名称").value).toBe("手动名称");
    expect(fieldInput("客户名称").value).toBe("手动客户");
  });

  it("AI 回填后提交体结构与现状一致且不含 code", async () => {
    vi.mocked(projectsApi.createProject).mockResolvedValueOnce({
      id: 1,
    } as never);
    const onCreated = vi.fn();
    render(<CreateProjectModal onClose={() => {}} onCreated={onCreated} />);
    await uploadAndAnalyze();
    await waitFor(() =>
      expect(fieldInput("项目名称").value).toBe("AI 识别项目"),
    );
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    await waitFor(() =>
      expect(projectsApi.createProject).toHaveBeenCalledTimes(1),
    );
    const body = vi.mocked(projectsApi.createProject).mock.calls[0][0];
    expect(body).toMatchObject({
      name: "AI 识别项目",
      customer_name: "AI 客户",
      project_type: "软件销售",
      contract_amount: 120000,
      signed_date: "2026-01-01",
      started_date: "2026-02-01",
      planned_delivery_date: null,
      progress: 0,
      notes: "合同备注",
      parties: [{ role: "甲方", name: "甲方公司", contact: "138" }],
    });
    expect("code" in body).toBe(false);
  });

  it("选择续签来源后随创建请求提交 renewal_source_id", async () => {
    vi.mocked(projectsApi.listProjects).mockResolvedValue({
      page: 1,
      size: 1000,
      total: 1,
      items: [
        {
          id: "5",
          name: "源项目",
          code: "SRC",
          customerName: "客户",
          projectType: "软件销售",
          status: "active",
          progress: 100,
          contractAmount: null,
          signedDate: "2025-01-01",
          plannedDeliveryDate: null,
          updatedAt: "",
        },
      ],
    });
    vi.mocked(projectsApi.createProject).mockResolvedValueOnce({
      id: 9,
    } as never);
    const onCreated = vi.fn();
    render(<CreateProjectModal onClose={() => {}} onCreated={onCreated} />);
    await waitFor(() =>
      expect(
        fieldInput("续签来源").querySelectorAll("option").length,
      ).toBeGreaterThan(1),
    );
    await userEvent.selectOptions(fieldInput("续签来源"), "5");
    await userEvent.type(fieldInput("项目名称"), "续签项目");
    await userEvent.type(fieldInput("客户名称"), "客户B");
    await userEvent.click(screen.getByRole("button", { name: "创建项目" }));
    await waitFor(() =>
      expect(projectsApi.createProject).toHaveBeenCalledTimes(1),
    );
    expect(
      vi.mocked(projectsApi.createProject).mock.calls[0][0]
        .renewal_source_id,
    ).toBe(5);
  });
});
