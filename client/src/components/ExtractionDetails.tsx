import { useCallback, useState } from "react";
import { aiApi, errorMessage } from "../api";
import type { ExtractionInfoResponseDto } from "../api";
import { Alert, Skeleton } from "./ui";

const supportedDocumentTypes = ["contract", "invoice", "payment"];

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

  const retry = async () => {
    setRetrying(true);
    try {
      await aiApi.createExtractionTask(version);
    } catch (reason) {
      console.error("重新触发识别失败", reason);
      setError(errorMessage(reason, "重新触发识别失败，请稍后重试"));
    } finally {
      setRetrying(false);
    }
  };

  const toggle = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && parseStatus === "parsed" && !result && !loading) void load();
  };

  return (
    <div className="extraction-panel">
      <button
        type="button"
        className="secondary extraction-toggle"
        aria-expanded={expanded}
        onClick={toggle}
      >
        {expanded ? "收起识别结果" : "识别结果"}
      </button>
      {expanded && (
        <div className="extraction-content">
          {parseStatus === "pending" || parseStatus === "processing" ? (
            <div className="extraction-status">识别中，请稍后…</div>
          ) : parseStatus === "failed" ? (
            <div className="extraction-status error">
              识别失败
              <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
              >
                {retrying ? "重试中…" : "重新识别"}
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
        : [
            ["金额", result.amount],
            ["日期", result.payment_date],
            ["付款方", result.payer],
            ["关联合同号", result.contract_no],
            ["备注", result.remarks],
          ];
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
            <dd>{show(value)}</dd>
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
