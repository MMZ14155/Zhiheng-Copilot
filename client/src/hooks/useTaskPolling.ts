import { useCallback, useEffect, useRef, useState } from "react";
import { aiApi, errorMessage } from "../api";

type PollingState = "idle" | "polling" | "completed" | "failed";

interface UseTaskPollingOptions {
  intervalMs?: number;
  onCompleted?: () => void | Promise<void>;
}

// 轮询间隔按 1.5 倍指数退避，封顶 6s，避免长任务期间持续高频请求。
const MAX_INTERVAL_MS = 6000;
const BACKOFF_FACTOR = 1.5;

export function useTaskPolling({
  intervalMs = 1500,
  onCompleted,
}: UseTaskPollingOptions = {}) {
  const [taskId, setTaskId] = useState<number | null>(null);
  const [state, setState] = useState<PollingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunRef = useRef(0);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const stopTimer = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const poll = useCallback(
    async (id: number, run: number, attempt: number) => {
      stopTimer();
      // 页面不可见时不发请求，按原间隔延后重试。
      if (document.visibilityState === "hidden") {
        timeoutRef.current = setTimeout(
          () => void poll(id, run, attempt),
          intervalMs,
        );
        return;
      }
      try {
        const task = await aiApi.getTask(id);
        if (activeRunRef.current !== run) return;
        if (task.status === "completed") {
          setState("completed");
          await onCompletedRef.current?.();
          return;
        }
        if (task.status === "failed") {
          setState("failed");
          setError(task.failure_reason ?? "总结生成失败，请重试");
          return;
        }
        const nextInterval = Math.min(
          intervalMs * Math.pow(BACKOFF_FACTOR, attempt),
          MAX_INTERVAL_MS,
        );
        timeoutRef.current = setTimeout(
          () => void poll(id, run, attempt + 1),
          nextInterval,
        );
      } catch (reason) {
        if (activeRunRef.current !== run) return;
        console.error("任务状态轮询失败", reason);
        setState("failed");
        setError(errorMessage(reason, "任务状态获取失败，请稍后重试"));
      }
    },
    [intervalMs, stopTimer],
  );

  const start = useCallback(
    (id: number) => {
      const run = activeRunRef.current + 1;
      activeRunRef.current = run;
      setTaskId(id);
      setState("polling");
      setError(null);
      void poll(id, run, 0);
    },
    [poll],
  );

  const retry = useCallback(() => {
    if (taskId === null) return;
    start(taskId);
  }, [start, taskId]);

  useEffect(
    () => () => {
      activeRunRef.current += 1;
      stopTimer();
    },
    [stopTimer],
  );

  return { state, error, start, retry, isPolling: state === "polling" };
}
