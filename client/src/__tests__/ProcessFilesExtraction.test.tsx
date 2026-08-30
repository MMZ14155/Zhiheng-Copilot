// @vitest-environment happy-dom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProcessFiles from "../components/ProcessFiles";
import VersionHistory from "../components/VersionHistory";

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("过程文件解析展示", () => {
  it("选填说明为空时提交体不包含 message 与 changelog", async () => {
    const commitBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith("/api/v1/projects/1/workspace-commit")) {
          commitBodies.push(JSON.parse(String(init?.body)));
          return jsonResponse({ snapshot: "hash", message: "提交成功" });
        }
        return jsonResponse({ files: [] });
      }),
    );
    render(<ProcessFiles projectId={1} onChanged={async () => {}} />);
    await screen.findByText("暂无过程文件");
    await userEvent.upload(
      screen.getByLabelText("选择文件"),
      new File(["contract"], "合同.pdf", { type: "application/pdf" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText("材料类型"),
      "contract",
    );
    await userEvent.click(screen.getByRole("button", { name: "加入改动" }));
    await userEvent.click(screen.getByRole("button", { name: "提交改动 (1)" }));
    await waitFor(() => expect(commitBodies).toHaveLength(1));
    const commitBody = commitBodies[0];
    expect(commitBody).not.toHaveProperty("message");
    expect(
      (commitBody.operations as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty("changelog");
  });

  it("仅为已设置材料类型的版本按 parse_status 展示徽标", async () => {
    const version = (documentType: string | null, parseStatus: string) => ({
      version: `${parseStatus}-hash`,
      document_type: documentType,
      parse_status: parseStatus,
      size_bytes: 1,
      uploaded_at: "2026-01-01T00:00:00Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          files: [
            {
              id: 1,
              name: "未识别",
              is_deliverable: false,
              created_at: "",
              updated_at: "",
              latest_version: version("contract", "pending"),
            },
            {
              id: 2,
              name: "处理中材料",
              is_deliverable: false,
              created_at: "",
              updated_at: "",
              latest_version: version("invoice", "processing"),
            },
            {
              id: 3,
              name: "已完成",
              is_deliverable: false,
              created_at: "",
              updated_at: "",
              latest_version: version("payment", "parsed"),
            },
            {
              id: 4,
              name: "失败材料",
              is_deliverable: false,
              created_at: "",
              updated_at: "",
              latest_version: version("contract", "failed"),
            },
            {
              id: 5,
              name: "普通材料",
              is_deliverable: false,
              created_at: "",
              updated_at: "",
              latest_version: version(null, "pending"),
            },
          ],
        }),
      ),
    );
    render(<ProcessFiles projectId={1} onChanged={async () => {}} />);
    await screen.findByText("普通材料", { selector: "strong" });
    expect(screen.getByText("待解析")).toBeTruthy();
    expect(screen.getByText("解析中")).toBeTruthy();
    expect(screen.getByText("已解析")).toBeTruthy();
    expect(screen.getByText("失败")).toBeTruthy();
    expect(
      within(
        screen
          .getByText("普通材料", { selector: "strong" })
          .closest("article")!,
      ).queryByText("待解析"),
    ).toBeNull();
  });

  it.each([
    [
      "contract",
      {
        contract_no: "HT-01",
        party_a: "甲方公司",
        party_b: "乙方公司",
        amount: 100,
        signed_date: "2026-01-02",
        payment_terms: [{ stage: "验收" }],
      },
      ["编号", "甲方", "乙方", "签署日期", "付款条款"],
    ],
    [
      "invoice",
      {
        invoice_no: "FP-01",
        issued_date: "2026-01-03",
        amount: 80,
        tax_amount: 8,
        tax_rate: 0.1,
        buyer: "购方",
        seller: "销方",
      },
      ["号码", "日期", "税额", "税率", "购买方", "销售方"],
    ],
    [
      "payment",
      {
        amount: 60,
        payment_date: "2026-01-04",
        payer: "付款公司",
        contract_no: "HT-01",
        remarks: "首款",
      },
      ["金额", "日期", "付款方", "关联合同号", "备注"],
    ],
  ])("展开 %s 识别结果并提示 missing_fields", async (type, fields, labels) => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).endsWith("/extract"))
          return jsonResponse({
            type,
            id: 1,
            version: `${type}-hash`,
            ...fields,
            missing_fields: ["补充字段"],
            raw_output: {},
            created_at: "2026-01-01T00:00:00Z",
          });
        return jsonResponse({
          items: [
            {
              id: 1,
              project_id: 1,
              source_file_id: 5,
              name: `${type}.pdf`,
              category: "合同",
              required: true,
              current_version: `${type}-hash`,
              status: "ok",
              versions: [
                {
                  version: `${type}-hash`,
                  file_id: 5,
                  prev_version: null,
                  storage_path: "",
                  content_hash: "",
                  size_bytes: 10,
                  uploaded_by: "测试员",
                  changelog: "",
                  document_type: type,
                  parse_status: "parsed",
                  is_frozen: false,
                  uploaded_at: "2026-01-01T00:00:00Z",
                },
              ],
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        });
      }),
    );
    render(
      <VersionHistory
        projectId={1}
        deliverables={[
          {
            id: "5",
            name: String(type),
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />,
    );
    await screen.findByText("已解析");
    await userEvent.click(screen.getByRole("button", { name: "识别结果" }));
    await screen.findByText("未识别字段：补充字段");
    labels.forEach((label) => expect(screen.getByText(label)).toBeTruthy());
  });
});
