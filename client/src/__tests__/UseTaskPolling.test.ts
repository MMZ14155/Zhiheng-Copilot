// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, aiApi } from "../api";
import { useTaskPolling } from "../hooks/useTaskPolling";

vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  aiApi: { getTask: vi.fn() },
}));
const task = (status: string, failure_reason: string | null = null) => ({
  id: 1,
  project_id: null,
  task_type: "summary",
  status,
  payload: {},
  failure_reason,
  started_at: null,
  finished_at: null,
  created_at: "",
  updated_at: "",
  llm_usage: { call_count: 0, input_tokens: 0, output_tokens: 0, cost: 0 },
});

describe("useTaskPolling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("启动、继续轮询并在完成时回调", async () => {
    const completed = vi.fn();
    vi.mocked(aiApi.getTask)
      .mockResolvedValueOnce(task("pending"))
      .mockResolvedValueOnce(task("completed"));
    const { result } = renderHook(() =>
      useTaskPolling({ intervalMs: 50, onCompleted: completed }),
    );
    act(() => result.current.start(7));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isPolling).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.state).toBe("completed");
    expect(completed).toHaveBeenCalledOnce();
  });

  it("展示任务失败原因并可重试", async () => {
    vi.mocked(aiApi.getTask)
      .mockResolvedValueOnce(task("failed", null))
      .mockResolvedValueOnce(task("completed"));
    const { result } = renderHook(() => useTaskPolling());
    act(() => result.current.start(3));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBe("failed");
    expect(result.current.error).toBe("总结生成失败，请重试");
    act(() => result.current.retry());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toBe("completed");
  });

  it("区分 ApiError 与未知异常", async () => {
    vi.mocked(aiApi.getTask)
      .mockRejectedValueOnce(new ApiError("服务异常", "X", 500))
      .mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useTaskPolling());
    act(() => result.current.start(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBe("服务异常");
    act(() => result.current.start(2));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.error).toBe("任务状态获取失败，请稍后重试");
  });

  it("忽略过期请求并在卸载时清理计时器", async () => {
    let resolveFirst!: (value: ReturnType<typeof task>) => void;
    vi.mocked(aiApi.getTask)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(task("pending"));
    const { result, unmount } = renderHook(() =>
      useTaskPolling({ intervalMs: 100 }),
    );
    act(() => result.current.start(1));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => result.current.start(2));
    await act(async () => {
      resolveFirst(task("completed"));
      await Promise.resolve();
    });
    expect(result.current.state).toBe("polling");
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(aiApi.getTask).toHaveBeenCalledTimes(2);
  });

  it("没有任务时 retry 保持空闲", () => {
    const { result } = renderHook(() => useTaskPolling());
    act(() => result.current.retry());
    expect(result.current.state).toBe("idle");
  });
});
