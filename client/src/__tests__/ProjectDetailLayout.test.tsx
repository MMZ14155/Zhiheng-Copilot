// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectDetail from "../pages/ProjectDetail";
import type { ProjectDetail as ProjectDetailModel } from "../api";
import { aiApi, projectsApi } from "../api";

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    aiApi: { ...actual.aiApi, getLatestSummary: vi.fn() },
    projectsApi: {
      ...actual.projectsApi,
      getProject: vi.fn(),
      getProjectRisks: vi.fn(),
      getCollectionOverview: vi.fn(),
      getRenewalChain: vi.fn(),
    },
  };
});
vi.mock("../components/VersionHistory", () => ({
  default: () => <div>版本历史</div>,
}));
vi.mock("../components/TagPanel", () => ({
  default: () => <div>标签面板</div>,
}));
vi.mock("../components/ProcessFiles", () => ({
  default: () => <div>过程文件内容</div>,
}));

const longContact =
  "电话13800001111邮箱zhangsan@example.com地址北京市海淀区中关村大街1号".repeat(
    3,
  );
const displayLongContact = `联系方式：${longContact}`;
const exactThresholdContact = "电".repeat(120);
const displayExactThresholdContact = `联系方式：${exactThresholdContact}`;

const baseProject: ProjectDetailModel = {
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
  status: "项目启动",
  notes: null,
  managerIds: [],
  deliverables: [],
  latestSummary: null,
};

function mockDetailApis(project: Partial<ProjectDetailModel>) {
  vi.mocked(projectsApi.getProject).mockResolvedValue({
    ...baseProject,
    ...project,
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
  vi.mocked(projectsApi.getRenewalChain).mockResolvedValue({
    projectId: "1",
    depthLimit: 20,
    items: [],
  });
  vi.mocked(aiApi.getLatestSummary).mockResolvedValue({
    id: 1,
    project_id: 1,
    version_no: 1,
    core_info: {},
    contract_invoice_progress: {},
    missing_materials: [],
    pending_questions: [],
    content: null,
    created_by: null,
    created_at: "2026-01-01",
    inputs: [],
  });
}

function renderDetail() {
  render(
    <MemoryRouter initialEntries={["/projects/1"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(async () => {
  const { setAuthToken } = await import("../api");
  setAuthToken(null);
});

describe("项目详情页排版", () => {
  it("长串联系方式默认折叠为单行省略，展开后完整显示，公司名横排完整", async () => {
    mockDetailApis({
      parties: [
        {
          role: "甲方",
          name: "北京示例科技集团有限公司",
          contact: longContact,
        },
      ],
    });
    renderDetail();
    await waitFor(() => expect(screen.getByText("签约方")).toBeTruthy());

    const name = screen.getByText("北京示例科技集团有限公司");
    expect(name.className).toContain("party-name");
    expect(name.className).toContain("detail-wrap");
    expect(name.className).not.toContain("collapsed");

    const contact = screen.getByText(displayLongContact);
    expect(contact.className).toContain("party-contact");
    expect(contact.className).toContain("detail-wrap");
    expect(contact.className).toContain("collapsed");
    expect(contact.closest("article")?.className).toContain("party-card");

    const toggle = screen.getByRole("button", { name: "展开" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(toggle);
    const expandedContact = screen.getByText(displayLongContact);
    expect(expandedContact.className).not.toContain("collapsed");
    expect(expandedContact.textContent).toBe(displayLongContact);
    const collapse = screen.getByRole("button", { name: "收起" });
    expect(collapse.getAttribute("aria-expanded")).toBe("true");
    await userEvent.click(collapse);
    expect(screen.getByText(displayLongContact).className).toContain("collapsed");
  });

  it("短联系方式与未填写联系方式不折叠、无展开开关", async () => {
    mockDetailApis({
      parties: [
        { role: "甲方", name: "甲公司", contact: exactThresholdContact },
        { role: "乙方", name: "乙公司", contact: "13800001111" },
        { role: "丙方", name: "丙公司", contact: null },
      ],
    });
    renderDetail();
    await waitFor(() => expect(screen.getByText("签约方")).toBeTruthy());

    expect(screen.getByText(displayExactThresholdContact).className).not.toContain(
      "collapsed",
    );
    expect(screen.queryByText("联系方式：13800001111")).toBeNull();
    expect(screen.getByText("联系方式：未填写联系方式")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "展开" })).toBeNull();
    expect(screen.getAllByText("甲公司")).toHaveLength(1);
  });

  it("备注、最新总结、风险列表、续签链等关键内容容器带断行类", async () => {
    const longNotes = `备注${"无空格长串".repeat(30)}`;
    const longSummary = `总结${"无空格长串".repeat(30)}`;
    mockDetailApis({
      notes: longNotes,
      latestSummary: {
        id: "s1",
        content: longSummary,
        createdBy: null,
        createdAt: "2026-01-01",
        inputs: [],
      },
    });
    vi.mocked(projectsApi.getProjectRisks).mockResolvedValue({
      level: "warn",
      risks: [
        {
          type: "payment-uncleared",
          level: "warn",
          reason: `原因${"无空格长串".repeat(30)}`,
          recommendation: `建议${"无空格长串".repeat(30)}`,
          missingParts: null,
          remainingDays: null,
          paymentStatus: "已付首款",
        },
      ],
    });
    vi.mocked(projectsApi.getRenewalChain).mockResolvedValue({
      projectId: "1",
      depthLimit: 20,
      items: [
        {
          id: "1",
          name: "详情项目",
          code: "P",
          customerName: "客户",
          projectType: "软件销售",
          contractAmount: null,
          signedDate: null,
          plannedDeliveryDate: null,
          status: "项目启动",
          updatedAt: "y",
        },
        {
          id: "2",
          name: `续签项目${"无空格长串".repeat(30)}`,
          code: "R",
          customerName: "客户",
          projectType: "软件销售",
          contractAmount: null,
          signedDate: "2026-01-01",
          plannedDeliveryDate: null,
          status: "项目启动",
          updatedAt: "z",
        },
      ],
    });
    renderDetail();
    await waitFor(() =>
      expect(screen.getAllByText("详情项目").length).toBeGreaterThanOrEqual(2),
    );

    expect(screen.getByText(longNotes).className).toContain("detail-wrap");
    expect(screen.getByText(longSummary).className).toContain("detail-wrap");

    const renewalLink = screen.getByRole("link", {
      name: `续签项目${"无空格长串".repeat(30)}`,
    });
    expect(renewalLink.className).toContain("detail-wrap");

    await userEvent.click(screen.getByRole("tab", { name: "风险列表" }));
    await waitFor(() =>
      expect(
        screen.getByText(`原因${"无空格长串".repeat(30)}`).className,
      ).toContain("detail-wrap"),
    );
    expect(
      screen.getByText(`建议${"无空格长串".repeat(30)}`).className,
    ).toContain("detail-wrap");
  });
});
