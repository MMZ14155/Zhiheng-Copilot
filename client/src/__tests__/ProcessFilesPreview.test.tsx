// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProcessFiles from "../components/ProcessFiles";
import { filesApi } from "../api";

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    filesApi: {
      ...actual.filesApi,
      listProjectFiles: vi.fn(),
      previewVersion: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("ProcessFiles preview", () => {
  it("过程文件列表为可预览文件提供预览入口", async () => {
    vi.mocked(filesApi.listProjectFiles).mockResolvedValue([
      {
        id: "1",
        name: "report.pdf",
        isDeliverable: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        latestVersion: {
          version: "v1hash",
          documentType: null,
          parseStatus: "done",
          sizeBytes: 1024,
          uploadedAt: "2026-01-01T00:00:00Z",
          extractPath: null,
        },
      },
      {
        id: "2",
        name: "data.zip",
        isDeliverable: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        latestVersion: {
          version: "v2hash",
          documentType: null,
          parseStatus: "done",
          sizeBytes: 2048,
          uploadedAt: "2026-01-01T00:00:00Z",
          extractPath: null,
        },
      },
    ]);
    vi.mocked(filesApi.previewVersion).mockResolvedValue({
      objectUrl: "blob:mock",
      contentType: "application/pdf",
    });
    vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock");

    render(<ProcessFiles projectId={1} onChanged={async () => {}} />);
    await screen.findByText("report.pdf");
    const previewButtons = screen.getAllByRole("button", { name: "预览" });
    expect(previewButtons.length).toBe(1);
    await userEvent.click(previewButtons[0]);
    await screen.findByTitle("report.pdf PDF 预览");
    await waitFor(() =>
      expect(filesApi.previewVersion).toHaveBeenCalledWith("v1hash"),
    );
    expect(screen.queryByText("data.zip")).toBeTruthy();
  });
});
