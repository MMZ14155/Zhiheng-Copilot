// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SnapshotTimeline from "../components/SnapshotTimeline";
import { ApiError, snapshotsApi } from "../api";

vi.mock("../api", async (original) => {
  const actual = await original<typeof import("../api")>();
  return {
    ...actual,
    snapshotsApi: {
      listSnapshots: vi.fn(),
      getSnapshot: vi.fn(),
      restoreSnapshot: vi.fn(),
    },
  };
});

const current = {
  hash: "a".repeat(64),
  parentHash: "b".repeat(64),
  author: "甲",
  message: "当前上传",
  createdAt: "2026-08-17T08:00:00Z",
  entryCount: 2,
};
const older = {
  hash: "b".repeat(64),
  parentHash: null,
  author: "乙",
  message: "早期版本",
  createdAt: "2026-08-16T08:00:00Z",
  entryCount: 1,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("SnapshotTimeline", () => {
  it("渲染时间线并仅在展开时加载文件树", async () => {
    vi.mocked(snapshotsApi.listSnapshots).mockResolvedValue({
      projectId: 7,
      snapshots: [current, older],
    });
    vi.mocked(snapshotsApi.getSnapshot).mockResolvedValue({
      ...older,
      projectId: 7,
      entries: [
        {
          fileId: 3,
          path: "合同.pdf",
          version: "c".repeat(64),
          uploader: "丙",
          uploadedAt: "2026-08-16T07:00:00Z",
        },
      ],
    });
    render(<SnapshotTimeline projectId={7} onChanged={vi.fn()} />);
    await screen.findByText("当前上传");
    expect(screen.getByText("当前")).toBeTruthy();
    expect(screen.getByTitle(current.hash).textContent).toBe("aaaaaaaa");
    expect(snapshotsApi.getSnapshot).not.toHaveBeenCalled();
    await userEvent.click(screen.getAllByText("展开文件树")[1]);
    await screen.findByText("合同.pdf");
    expect(snapshotsApi.getSnapshot).toHaveBeenCalledWith(older.hash);
    expect(screen.getByTitle("c".repeat(64)).textContent).toBe("cccccccc");
  });

  it("确认恢复后展示结果与 skipped 清单并刷新数据", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    vi.mocked(snapshotsApi.listSnapshots).mockResolvedValue({
      projectId: 7,
      snapshots: [current, older],
    });
    vi.mocked(snapshotsApi.restoreSnapshot).mockResolvedValue({
      snapshot: "d".repeat(64),
      restoredFiles: 1,
      skipped: [{ fileId: 8, path: "缺失.pdf", reason: "源版本不存在" }],
    });
    render(<SnapshotTimeline projectId={7} onChanged={onChanged} />);
    await screen.findByText("早期版本");
    await userEvent.click(screen.getByRole("button", { name: "恢复到此快照" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "确认恢复" }),
    );
    await screen.findByText("恢复 1 个文件");
    expect(screen.getByText("部分文件未能恢复")).toBeTruthy();
    expect(screen.getByText("缺失.pdf")).toBeTruthy();
    expect(screen.getByText("源版本不存在")).toBeTruthy();
    expect(snapshotsApi.restoreSnapshot).toHaveBeenCalledWith(older.hash);
    await waitFor(() =>
      expect(snapshotsApi.listSnapshots).toHaveBeenCalledTimes(2),
    );
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("取消确认不请求恢复并原样展示 403 detail", async () => {
    vi.mocked(snapshotsApi.listSnapshots).mockResolvedValue({
      projectId: 7,
      snapshots: [current, older],
    });
    render(<SnapshotTimeline projectId={7} onChanged={vi.fn()} />);
    await screen.findByText("早期版本");
    await userEvent.click(screen.getByRole("button", { name: "恢复到此快照" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "取消" }),
    );
    expect(snapshotsApi.restoreSnapshot).not.toHaveBeenCalled();

    vi.mocked(snapshotsApi.restoreSnapshot).mockRejectedValue(
      new ApiError("仅项目经理可恢复快照", "FORBIDDEN", 403),
    );
    await userEvent.click(screen.getByRole("button", { name: "恢复到此快照" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "确认恢复" }),
    );
    await screen.findByText("仅项目经理可恢复快照");
  });

  it("处理加载错误、重试与空态", async () => {
    vi.mocked(snapshotsApi.listSnapshots)
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce({ projectId: 7, snapshots: [] });
    render(<SnapshotTimeline projectId={7} onChanged={vi.fn()} />);
    await screen.findByText("快照时间线加载失败，请稍后重试");
    await userEvent.click(screen.getByRole("button", { name: "重试" }));
    await screen.findByText("暂无快照");
  });
});
