import { useEffect, useState } from "react";
import { aiApi, errorMessage } from "../api";
import ExtractionDetails, {
  isExtractableDocumentType,
} from "./ExtractionDetails";
import "./ParseControls.css";

interface ParseControlsProps {
  projectId: number;
  version: string;
  documentType: string | null;
  parseStatus: string;
  onChanged: () => Promise<void> | void;
}

const STAGE_LABELS: Record<string, string> = {
  extracting: "正在提取文件内容…",
  generating: "正在生成识别结果…",
  completed: "识别完成",
};

export default function ParseControls({
  version,
  documentType,
  parseStatus,
  onChanged,
}: ParseControlsProps) {
  const [starting, setStarting] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const startParse = async () => {
    setStarting(true);
    try {
      const { task_id } = await aiApi.createExtractionTask(version);
      setTaskId(task_id);
      setStage("extracting");
      setProgress(0);
      await onChanged();
    } catch (reason) {
      console.error("启动识别失败", reason);
      alert(errorMessage(reason, "启动识别失败，请稍后重试"));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (taskId === null || parseStatus !== "processing") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const task = await aiApi.getTask(taskId);
        if (cancelled) return;
        setStage(task.stage);
        setProgress(task.progress);
        if (task.status === "completed" || task.status === "failed") {
          await onChanged();
        }
      } catch (reason) {
        console.error("识别任务轮询失败", reason);
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId, parseStatus, onChanged]);

  useEffect(() => {
    if (parseStatus !== "processing") {
      setTaskId(null);
      setStage(null);
      setProgress(null);
    }
  }, [parseStatus]);

  if (!isExtractableDocumentType(documentType)) return null;

  if (parseStatus === "parsed") {
    return <ExtractionDetails version={version} parseStatus={parseStatus} />;
  }

  if (parseStatus === "pending" || parseStatus === "failed") {
    return (
      <button
        type="button"
        className="secondary parse-button"
        disabled={starting}
        onClick={() => void startParse()}
      >
        {starting ? "启动中…" : parseStatus === "failed" ? "重新识别" : "解析"}
      </button>
    );
  }

  if (parseStatus === "processing") {
    const displayProgress = progress ?? 0;
    return (
      <div className="parse-progress">
        <div className="parse-progress-label">
          <span>{stage ? STAGE_LABELS[stage] ?? stage : "识别中…"}</span>
          <span>{displayProgress}%</span>
        </div>
        <div className="parse-progress-track">
          <div
            className="parse-progress-bar"
            style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
          />
        </div>
      </div>
    );
  }

  return null;
}
