import { useCallback, useEffect, useRef, useState } from 'react';
import { aiApi, ApiError } from '../api';

type PollingState = 'idle' | 'polling' | 'completed' | 'failed';

interface UseTaskPollingOptions {
  intervalMs?: number;
  onCompleted?: () => void | Promise<void>;
}

const readableError = (reason: unknown) => reason instanceof ApiError
  ? reason.message
  : '任务状态获取失败，请稍后重试';

export function useTaskPolling({ intervalMs = 1500, onCompleted }: UseTaskPollingOptions = {}) {
  const [taskId, setTaskId] = useState<number | null>(null);
  const [state, setState] = useState<PollingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunRef = useRef(0);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => { onCompletedRef.current = onCompleted; }, [onCompleted]);

  const stopTimer = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const poll = useCallback(async (id: number, run: number) => {
    stopTimer();
    try {
      const task = await aiApi.getTask(id);
      if (activeRunRef.current !== run) return;
      if (task.status === 'completed') {
        setState('completed');
        await onCompletedRef.current?.();
        return;
      }
      if (task.status === 'failed') {
        setState('failed');
        setError(task.failure_reason ?? '总结生成失败，请重试');
        return;
      }
      timeoutRef.current = setTimeout(() => { void poll(id, run); }, intervalMs);
    } catch (reason) {
      if (activeRunRef.current !== run) return;
      console.error('任务状态轮询失败', reason);
      setState('failed');
      setError(readableError(reason));
    }
  }, [intervalMs, stopTimer]);

  const start = useCallback((id: number) => {
    const run = activeRunRef.current + 1;
    activeRunRef.current = run;
    setTaskId(id);
    setState('polling');
    setError(null);
    void poll(id, run);
  }, [poll]);

  const retry = useCallback(() => {
    if (taskId === null) return;
    start(taskId);
  }, [start, taskId]);

  useEffect(() => () => {
    activeRunRef.current += 1;
    stopTimer();
  }, [stopTimer]);

  return { state, error, start, retry, isPolling: state === 'polling' };
}
