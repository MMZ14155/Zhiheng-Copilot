// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FilePreview, { isPreviewableFile } from "../components/FilePreview";
import { filesApi } from "../api";

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    filesApi: {
      ...actual.filesApi,
      previewVersion: vi.fn(),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("FilePreview", () => {
  beforeEach(() => {
    vi.spyOn(globalThis.URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(globalThis.URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("可预览扩展名判定正确", () => {
    expect(isPreviewableFile("合同.pdf")).toBe(true);
    expect(isPreviewableFile("image.PNG")).toBe(true);
    expect(isPreviewableFile("report.md")).toBe(true);
    expect(isPreviewableFile("data.log")).toBe(true);
    expect(isPreviewableFile("archive.zip")).toBe(false);
    expect(isPreviewableFile(" model.pdf ")).toBe(true);
  });

  it("PDF 使用 iframe 渲染", async () => {
    vi.mocked(filesApi.previewVersion).mockResolvedValue({
      objectUrl: "blob:mock",
      contentType: "application/pdf",
    });
    render(<FilePreview name="合同.pdf" version="v1" onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByTitle("合同.pdf PDF 预览")).toBeTruthy(),
    );
    expect(screen.getByTitle("合同.pdf PDF 预览").tagName).toBe("IFRAME");
    expect(filesApi.previewVersion).toHaveBeenCalledWith("v1");
  });

  it("图片使用 img 渲染", async () => {
    vi.mocked(filesApi.previewVersion).mockResolvedValue({
      objectUrl: "blob:mock",
      contentType: "image/png",
    });
    render(<FilePreview name="图.png" version="v2" onClose={vi.fn()} />);
    const img = await screen.findByAltText("图.png 预览");
    expect(img.tagName).toBe("IMG");
  });

  it("文本文件显示内容", async () => {
    vi.mocked(filesApi.previewVersion).mockResolvedValue({
      objectUrl: "blob:mock",
      contentType: "text/plain",
      textContent: "hello preview",
    });
    render(<FilePreview name="日志.log" version="v3" onClose={vi.fn()} />);
    await screen.findByText("hello preview");
    expect(screen.getByText("hello preview").tagName).toBe("PRE");
  });

  it("加载失败可重试", async () => {
    const { ApiError } = await import("../api");
    vi.mocked(filesApi.previewVersion)
      .mockRejectedValueOnce(new ApiError("预览失败", "X", 500))
      .mockResolvedValueOnce({
        objectUrl: "blob:mock",
        contentType: "application/pdf",
      });
    render(<FilePreview name="x.pdf" version="v4" onClose={vi.fn()} />);
    await screen.findByText("预览失败");
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "重试" }),
      ).toBeNull(),
    );
  });

  it("关闭时调用 onClose", async () => {
    vi.mocked(filesApi.previewVersion).mockResolvedValue({
      objectUrl: "blob:mock",
      contentType: "application/pdf",
    });
    const onClose = vi.fn();
    render(<FilePreview name="x.pdf" version="v5" onClose={onClose} />);
    await screen.findByTitle("x.pdf PDF 预览");
    await userEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
