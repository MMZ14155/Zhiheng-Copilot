import { useCallback, useEffect, useState } from "react";
import { aiApi, errorMessage, filesApi } from "../api";
import type { ExtractionInfoResponseDto } from "../api";
import { Alert, Skeleton } from "./ui";

const supportedDocumentTypes = ["contract", "invoice"];

export function isExtractableDocumentType(documentType: string | null) {
  return documentType !== null && supportedDocumentTypes.includes(documentType);
}

export function ParseStatusBadge({
  documentType,
  parseStatus,
}: {
  documentType: string | null;
  parseStatus: string;
}) {
  if (!isExtractableDocumentType(documentType)) return null;
  const status =
    parseStatus === "pending"
      ? { label: "待解析", className: "pending" }
      : parseStatus === "processing"
        ? { label: "解析中", className: "processing" }
        : parseStatus === "parsed"
          ? { label: "已解析", className: "parsed" }
          : parseStatus === "failed"
            ? { label: "失败", className: "failed" }
            : parseStatus === "multimodal_required"
              ? { label: "需多模态", className: "multimodal" }
              : null;
  if (!status) return null;
  return (
    <span className={`version-badge parse-${status.className}`}>
      {status.label}
    </span>
  );
}

export default function ExtractionDetails({
  version,
  parseStatus,
}: {
  version: string;
  parseStatus: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [result, setResult] = useState<ExtractionInfoResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [activeTaskStatus, setActiveTaskStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await aiApi.getExtraction(version));
    } catch (reason) {
      console.error("识别结果加载失败", reason);
      setError(errorMessage(reason, "识别结果加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [version]);

  const startRetry = async () => {
    if (retrying || activeTaskId) return;
    setRetrying(true);
    setError(null);
    setResult(null);
    try {
      const task = await aiApi.createExtractionTask(version);
      setActiveTaskId(task.task_id);
      setActiveTaskStatus("pending");
    } catch (reason) {
      console.error("重新触发识别失败", reason);
      setError(errorMessage(reason, "重新触发识别失败，请稍后重试"));
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!activeTaskId) return;
    const poll = async () => {
      try {
        const task = await aiApi.getTask(activeTaskId);
        setActiveTaskStatus(task.status);
        if (task.status === "completed") {
          setActiveTaskId(null);
          void load();
        } else if (task.status === "failed") {
          setActiveTaskId(null);
          setError(
            task.failure_reason
              ? `识别失败：${task.failure_reason}`
              : "识别任务执行失败，请稍后重试",
          );
        }
      } catch (reason) {
        console.error("轮询识别任务失败", reason);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1500);
    return () => clearInterval(timer);
  }, [activeTaskId, load]);

  const toggle = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && parseStatus === "parsed" && !result && !loading && !activeTaskId) {
      void load();
    }
  };

  const isBusy =
    parseStatus === "pending" ||
    parseStatus === "processing" ||
    retrying ||
    activeTaskId !== null;

  return (
    <div className="extraction-panel">
      <div className="extraction-header">
        <button
          type="button"
          className="secondary extraction-toggle"
          aria-expanded={expanded}
          onClick={toggle}
        >
          {expanded ? "收起识别结果" : "识别结果"}
        </button>
        <button
          type="button"
          className="secondary extraction-retry"
          onClick={() => void startRetry()}
          disabled={isBusy}
          title="重新运行一次识别"
        >
          {retrying || activeTaskId ? "重试中…" : "重新识别"}
        </button>
      </div>
      {expanded && (
        <div className="extraction-content">
          {(parseStatus === "parsed" || parseStatus === "failed" || parseStatus === "multimodal_required") && (
            <ExtractTextPanel version={version} />
          )}
          {activeTaskId || parseStatus === "pending" || parseStatus === "processing" ? (
            <div className="extraction-status">
              {activeTaskStatus === "failed"
                ? "识别失败"
                : "识别中，请稍候…"}
              {activeTaskStatus && activeTaskStatus !== "pending" && (
                <span className="extraction-status-detail">（{activeTaskStatus}）</span>
              )}
            </div>
          ) : parseStatus === "failed" ? (
            <div className="extraction-status error">
              识别失败
              <button
                type="button"
                onClick={() => void startRetry()}
                disabled={retrying || activeTaskId !== null}
              >
                {retrying || activeTaskId ? "重试中…" : "重新识别"}
              </button>
            </div>
          ) : parseStatus === "multimodal_required" ? (
            <div className="extraction-status multimodal">
              该文件无法通过文本提取获取有效信息，需要多模态模型处理。
              <button
                type="button"
                onClick={() => void startRetry()}
                disabled={retrying || activeTaskId !== null}
              >
                {retrying || activeTaskId ? "重试中…" : "重新识别"}
              </button>
            </div>
          ) : loading ? (
            <Skeleton rows={2} />
          ) : error ? (
            <Alert
              action={
                <button type="button" onClick={() => void load()}>
                  重试
                </button>
              }
            >
              {error}
            </Alert>
          ) : (
            result && <ExtractionResult result={result} />
          )}
        </div>
      )}
    </div>
  );
}

function ExtractTextPanel({ version }: { version: string }) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (visible) {
      setVisible(false);
      return;
    }
    if (text === null && !error) {
      setLoading(true);
      try {
        const res = await filesApi.getExtractText(version);
        setText(res.text);
        setHash(res.contentHash);
      } catch (reason) {
        console.error("加载提取文本失败", reason);
        setError(errorMessage(reason, "加载提取文本失败，请稍后重试"));
      } finally {
        setLoading(false);
      }
    }
    setVisible(true);
  };

  return (
    <div className="extract-text-panel">
      <button
        type="button"
        className="secondary extract-text-toggle"
        onClick={() => void toggle()}
        disabled={loading}
      >
        {loading ? "加载中…" : visible ? "隐藏提取文本" : "查看提取文本"}
      </button>
      {visible && (
        <div className="extract-text-content">
          {error ? (
            <Alert>{error}</Alert>
          ) : (
            <>
              {hash && (
                <p className="extract-text-hash">
                  索引：{hash}.md
                </p>
              )}
              <pre className="extract-text-body">{text ?? ""}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatPaymentTerms(value: unknown): string {
  if (value === null || value === undefined || value === "") return "未识别";
  const terms = Array.isArray(value) ? value : [value];
  const parts = terms
    .map((term) => {
      if (!term || typeof term !== "object") return String(term);
      const t = term as Record<string, unknown>;
      const stage = t.stage ? String(t.stage) : "";
      const ratio = t.ratio;
      if (!stage && ratio === undefined) return JSON.stringify(term);
      if (
        ratio === "missing_fields" ||
        ratio === null ||
        ratio === undefined ||
        ratio === ""
      ) {
        return stage || "未识别";
      }
      return `${stage}（${ratio}）`;
    })
    .filter(Boolean);
  return parts.length ? parts.join("；") : "未识别";
}

function ExtractionResult({ result }: { result: ExtractionInfoResponseDto }) {
  const fields: Array<[string, unknown]> =
    result.type === "contract"
      ? [
          ["编号", result.contract_no],
          ["甲方", result.party_a],
          ["乙方", result.party_b],
          ["金额", result.amount],
          ["签署日期", result.signed_date],
          ["付款条款", result.payment_terms],
        ]
      : result.type === "invoice"
        ? [
            ["号码", result.invoice_no],
            ["日期", result.issued_date],
            ["金额", result.amount],
            ["税额", result.tax_amount],
            ["税率", result.tax_rate],
            ["购买方", result.buyer],
            ["销售方", result.seller],
          ]
        : [];
  const show = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "未识别";
    if (Array.isArray(value))
      return value.length
        ? value
            .map((item) =>
              typeof item === "object" ? JSON.stringify(item) : String(item),
            )
            .join("；")
        : "无";
    return String(value);
  };
  return (
    <div className="extraction-result">
      <dl>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {label === "付款条款" ? formatPaymentTerms(value) : show(value)}
            </dd>
          </div>
        ))}
      </dl>
      {result.missing_fields.length > 0 && (
        <p className="has-missing">
          未识别字段：{result.missing_fields.join("、")}
        </p>
      )}
    </div>
  );
}
