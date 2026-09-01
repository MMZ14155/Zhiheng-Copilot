import { useCallback, useEffect, useState } from "react";
import { errorMessage, filesApi, snapshotsApi } from "../api";
import type {
  SnapshotDetail,
  SnapshotRestoreResult,
  SnapshotSummary,
} from "../api";
import { formatDateTime, shortHash } from "../utils/format";
import { downloadBlob } from "../utils/download";
import { Alert, Button, Empty, Modal, Skeleton } from "./ui";
import FilePreview, { isPreviewableFile } from "./FilePreview";
import "./SnapshotTimeline.css";

export default function SnapshotTimeline({
  projectId,
  onChanged,
}: {
  projectId: number;
  onChanged: () => Promise<void>;
}) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SnapshotDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [restoringHash, setRestoringHash] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] =
    useState<SnapshotRestoreResult | null>(null);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(
    null,
  );
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<{
    name: string;
    version: string;
  } | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshots((await snapshotsApi.listSnapshots(projectId)).snapshots);
    } catch (reason) {
      console.error("快照时间线加载失败", reason);
      setError(errorMessage(reason, "快照时间线加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  const loadDetail = async (hash: string) => {
    setDetailLoading(hash);
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[hash];
      return next;
    });
    try {
      const detail = await snapshotsApi.getSnapshot(hash);
      setDetails((current) => ({ ...current, [hash]: detail }));
    } catch (reason) {
      console.error("快照文件树加载失败", reason);
      setDetailErrors((current) => ({
        ...current,
        [hash]: errorMessage(reason, "快照文件树加载失败，请稍后重试"),
      }));
    } finally {
      setDetailLoading((current) => (current === hash ? null : current));
    }
  };

  const toggle = (hash: string) => {
    if (expandedHash === hash) {
      setExpandedHash(null);
      return;
    }
    setExpandedHash(hash);
    if (!details[hash]) void loadDetail(hash);
  };

  const download = async (version: string) => {
    setDownloadingVersion(version);
    setDownloadError(null);
    try {
      const { blob, filename } = await filesApi.downloadVersion(version);
      downloadBlob(blob, filename);
    } catch (reason) {
      console.error("快照版本下载失败", reason);
      setDownloadError(errorMessage(reason, "下载失败，请稍后重试"));
    } finally {
      setDownloadingVersion(null);
    }
  };

  const [confirmTarget, setConfirmTarget] = useState<SnapshotSummary | null>(
    null,
  );

  const restore = async (snapshot: SnapshotSummary) => {
    setConfirmTarget(null);
    setRestoringHash(snapshot.hash);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const result = await snapshotsApi.restoreSnapshot(snapshot.hash);
      setRestoreResult(result);
      await loadSnapshots();
      await onChanged();
    } catch (reason) {
      console.error("快照恢复失败", reason);
      setRestoreError(errorMessage(reason, "快照恢复失败，请稍后重试"));
    } finally {
      setRestoringHash(null);
    }
  };

  if (loading) return <Skeleton rows={4} />;
  if (error)
    return (
      <Alert
        action={
          <Button
            type="button"
            variant="danger"
            onClick={() => void loadSnapshots()}
          >
            重试
          </Button>
        }
      >
        {error}
      </Alert>
    );
  if (snapshots.length === 0) return <Empty title="暂无快照" />;

  return (
    <div className="project-snapshot-panel">
      {restoreError && <Alert>{restoreError}</Alert>}
      {restoreResult && (
        <div className="snapshot-restore-result">
          <Alert tone="success">
            恢复 {restoreResult.restoredFiles} 个文件
          </Alert>
          {restoreResult.skipped.length > 0 && (
            <Alert tone="warning">部分文件未能恢复</Alert>
          )}
          {restoreResult.skipped.length > 0 && (
            <ul aria-label="未恢复文件清单">
              {restoreResult.skipped.map((item) => (
                <li key={`${item.fileId}-${item.path}`}>
                  <strong>{item.path}</strong>
                  <span>{item.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ol className="project-snapshot-timeline">
        {snapshots.map((snapshot, index) => {
          const expanded = expandedHash === snapshot.hash;
          const detail = details[snapshot.hash];
          return (
            <li key={snapshot.hash} className="project-snapshot-item">
              <div className="snapshot-marker" aria-hidden="true" />
              <article>
                <div className="snapshot-heading">
                  <button
                    type="button"
                    className="snapshot-toggle"
                    onClick={() => toggle(snapshot.hash)}
                    aria-expanded={expanded}
                  >
                    <span>{snapshot.message}</span>
                    {index === 0 && <small>当前</small>}
                  </button>
                </div>
                <div className="snapshot-meta">
                  <time dateTime={snapshot.createdAt}>
                    {formatDateTime(snapshot.createdAt)}
                  </time>
                  <span>{snapshot.author}</span>
                  <span>{snapshot.entryCount} 个文件</span>
                  <code title={snapshot.hash}>{shortHash(snapshot.hash)}</code>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => toggle(snapshot.hash)}
                  >
                    {expanded ? "收起文件树" : "展开文件树"}
                  </Button>
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => setConfirmTarget(snapshot)}
                      disabled={restoringHash === snapshot.hash}
                    >
                      {restoringHash === snapshot.hash
                        ? "恢复中…"
                        : "恢复到此快照"}
                    </Button>
                  )}
                </div>
                {expanded && (
                  <div className="snapshot-detail">
                    {detailLoading === snapshot.hash && <Skeleton rows={2} />}
                    {detailErrors[snapshot.hash] && (
                      <Alert
                        action={
                          <Button
                            type="button"
                            variant="danger"
                            onClick={() => void loadDetail(snapshot.hash)}
                          >
                            重试
                          </Button>
                        }
                      >
                        {detailErrors[snapshot.hash]}
                      </Alert>
                    )}
                    {downloadError && <Alert>{downloadError}</Alert>}
                    {!detailLoading &&
                      !detailErrors[snapshot.hash] &&
                      detail &&
                      (detail.entries.length === 0 ? (
                        <Empty title="快照为空" />
                      ) : (
                        <ol className="snapshot-file-tree">
                          {detail.entries.map((entry) => (
                            <li key={`${entry.fileId}-${entry.path}`}>
                              <strong>{entry.path}</strong>
                              <span>{entry.uploader}</span>
                              <time dateTime={entry.uploadedAt}>
                                {formatDateTime(entry.uploadedAt)}
                              </time>
                              <code title={entry.version}>
                                {shortHash(entry.version)}
                              </code>
                              {isPreviewableFile(entry.path) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() =>
                                    setPreviewTarget({
                                      name: entry.path,
                                      version: entry.version,
                                    })
                                  }
                                >
                                  预览
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => download(entry.version)}
                                disabled={downloadingVersion === entry.version}
                              >
                                {downloadingVersion === entry.version
                                  ? "下载中…"
                                  : "下载"}
                              </Button>
                            </li>
                          ))}
                        </ol>
                      ))}
                  </div>
                )}
              </article>
            </li>
          );
        })}
      </ol>
      {confirmTarget && (
        <Modal
          title="恢复快照"
          onClose={() => setConfirmTarget(null)}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setConfirmTarget(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void restore(confirmTarget)}
              >
                确认恢复
              </Button>
            </>
          }
        >
          <p>
            确定恢复到快照 {shortHash(confirmTarget.hash)}
            吗？此操作会生成新的恢复快照。
          </p>
        </Modal>
      )}
      {previewTarget && (
        <FilePreview
          {...previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </div>
  );
}
