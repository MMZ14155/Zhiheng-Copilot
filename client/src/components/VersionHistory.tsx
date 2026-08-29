import { useCallback, useEffect, useState } from "react";
import { aiApi, ApiError, deliverablesApi, errorMessage, filesApi } from "../api";
import type {
  ExtractionInfoResponseDto,
  FileVersion,
  ProjectDeliverable,
  TrackedFile,
} from "../api";
import { useTaskPolling } from "../hooks/useTaskPolling";
import { formatDateTime, shortHash } from "../utils/format";
import { downloadBlob } from "../utils/download";
import FilePreview, { isPreviewableFile } from "./FilePreview";

interface VersionHistoryProps {
  projectId: number;
  deliverables: ProjectDeliverable[];
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function VersionHistory({
  projectId,
  deliverables,
}: VersionHistoryProps) {
  const [trackedFiles, setTrackedFiles] = useState<TrackedFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(
    null,
  );
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>(
    {},
  );
  const [previewTarget, setPreviewTarget] = useState<{
    name: string;
    version: string;
  } | null>(null);

  const loadTrackedFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrackedFiles(await deliverablesApi.listTrackedFiles(projectId));
    } catch (reason) {
      console.error("交付物版本加载失败", reason);
      setError(errorMessage(reason, "交付物加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 依赖交付物 id 签名而非长度：内容变化但数量不变时也能触发刷新。
  const deliverablesKey = deliverables.map((item) => item.id).join(",");
  useEffect(() => {
    if (deliverables.length > 0) void loadTrackedFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTrackedFiles, deliverablesKey]);

  const download = useCallback(async (version: string) => {
    setDownloadingVersion(version);
    setDownloadErrors((current) => {
      const next = { ...current };
      delete next[version];
      return next;
    });
    try {
      const { blob, filename } = await filesApi.downloadVersion(version);
      downloadBlob(blob, filename);
    } catch (reason) {
      console.error("版本下载失败", reason);
      setDownloadErrors((current) => ({
        ...current,
        [version]: errorMessage(reason, "下载失败，请稍后重试"),
      }));
    } finally {
      setDownloadingVersion(null);
    }
  }, []);

  if (deliverables.length === 0)
    return <p className="detail-empty">暂无交付物</p>;
  if (loading)
    return (
      <p className="version-state" role="status">
        正在加载交付物版本…
      </p>
    );
  if (error)
    return (
      <div className="version-state version-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void loadTrackedFiles()}>
          重试
        </button>
      </div>
    );

  return (
    <div className="deliverable-list">
      {deliverables.map((deliverable) => {
        const trackedFile = trackedFiles?.find(
          (item) => item.sourceFileId === Number(deliverable.id),
        );
        const version = trackedFile?.versions.find((v) => v.isCurrent) ?? null;
        const filename = trackedFile?.name ?? deliverable.name;
        return (
          <article className="deliverable-item" key={deliverable.id}>
            <div className="deliverable-heading">
              <span>{deliverable.name}</span>
              <small>更新时间 {formatDateTime(deliverable.updatedAt)}</small>
            </div>
            {version === null && <p className="version-state">暂无版本</p>}
            {version !== null && (
              <div className="version-current">
                <div className="version-heading">
                  <code title={version.version}>
                    {shortHash(version.version)}
                  </code>
                  {version.isFrozen && (
                    <span className="version-badge frozen">已冻结</span>
                  )}
                  {isPreviewableFile(filename) && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setPreviewTarget({ name: filename, version: version.version })
                      }
                    >
                      预览
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void download(version.version)}
                    disabled={downloadingVersion === version.version}
                  >
                    {downloadingVersion === version.version
                      ? "下载中…"
                      : "下载"}
                  </button>
                </div>
                {downloadErrors[version.version] && (
                  <div className="version-state version-error" role="alert">
                    {downloadErrors[version.version]}
                  </div>
                )}
                <dl className="version-meta">
                  <div>
                    <dt>上传人</dt>
                    <dd>{version.uploadedBy || "未知"}</dd>
                  </div>
                  <div>
                    <dt>上传时间</dt>
                    <dd>{formatDateTime(version.uploadedAt)}</dd>
                  </div>
                  <div>
                    <dt>文件大小</dt>
                    <dd>{formatSize(version.sizeBytes)}</dd>
                  </div>
                  <div className="version-changelog">
                    <dt>变更说明</dt>
                    <dd>{version.changelog || "无"}</dd>
                  </div>
                </dl>
                {version.documentType &&
                  ["contract", "invoice", "payment"].includes(
                    version.documentType,
                  ) && <Extraction version={version} />}
              </div>
            )}
          </article>
        );
      })}
      {previewTarget && (
        <FilePreview
          {...previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}

function Extraction({ version }: { version: FileVersion }) {
  const [result, setResult] = useState<ExtractionInfoResponseDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await aiApi.getExtraction(version.version));
      setMissing(false);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "EXTRACTION_NOT_FOUND")
        setMissing(true);
      else setError(errorMessage(reason, "识别结果加载失败"));
    } finally {
      setLoading(false);
    }
  }, [version.version]);
  const polling = useTaskPolling({ onCompleted: load });
  useEffect(() => {
    void load();
  }, [load]);
  const start = async () => {
    setError(null);
    try {
      const task = await aiApi.createExtractionTask(version.version);
      polling.start(task.task_id);
    } catch (reason) {
      console.error("识别触发失败", reason);
      setError(errorMessage(reason, "识别任务创建失败"));
    }
  };
  if (loading) return <p role="status">正在加载识别结果…</p>;
  return (
    <div className="extraction-panel">
      <strong>材料识别</strong>
      {result && <ExtractionResult result={result} />}
      {missing && !polling.isPolling && (
        <button type="button" onClick={() => void start()}>
          触发识别
        </button>
      )}
      {polling.isPolling && <p role="status">识别任务处理中…</p>}
      {(error ?? polling.error) && (
        <div className="form-error" role="alert">
          <span>{error ?? polling.error}</span>
          <button
            type="button"
            onClick={
              polling.state === "failed" ? polling.retry : () => void load()
            }
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}

function ExtractionResult({ result }: { result: ExtractionInfoResponseDto }) {
  const fields: Array<[string, unknown]> =
    result.type === "contract"
      ? [
          ["合同编号", result.contract_no],
          ["甲方", result.party_a],
          ["乙方", result.party_b],
          ["金额", result.amount],
          ["签约日期", result.signed_date],
          ["付款条款", result.payment_terms],
        ]
      : result.type === "invoice"
        ? [
            ["发票号码", result.invoice_no],
            ["开票日期", result.issued_date],
            ["金额", result.amount],
            ["税额", result.tax_amount],
            ["税率", result.tax_rate],
            ["购买方", result.buyer],
            ["销售方", result.seller],
          ]
        : [
            ["付款金额", result.amount],
            ["付款日期", result.payment_date],
            ["付款方", result.payer],
            ["合同编号", result.contract_no],
            ["备注", result.remarks],
          ];
  const show = (value: unknown) =>
    value === null
      ? "未识别"
      : Array.isArray(value)
        ? value.length
          ? JSON.stringify(value)
          : "无"
        : String(value);
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
      <p className={result.missing_fields.length ? "has-missing" : ""}>
        缺失字段 {result.missing_fields.join("、") || "无"}
      </p>
    </div>
  );
}
