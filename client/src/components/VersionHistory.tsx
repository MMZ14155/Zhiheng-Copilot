import { useCallback, useEffect, useState } from "react";
import { deliverablesApi, errorMessage, filesApi } from "../api";
import type { ProjectDeliverable, TrackedFile } from "../api";
import { formatDateTime, shortHash } from "../utils/format";
import { downloadBlob } from "../utils/download";
import FilePreview, { isPreviewableFile } from "./FilePreview";
import ExtractionDetails, {
  isExtractableDocumentType,
  ParseStatusBadge,
} from "./ExtractionDetails";

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
                  <ParseStatusBadge
                    documentType={version.documentType}
                    parseStatus={version.parseStatus}
                  />
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
                {isExtractableDocumentType(version.documentType) && (
                  <ExtractionDetails
                    key={version.version}
                    version={version.version}
                    parseStatus={version.parseStatus}
                  />
                )}
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
