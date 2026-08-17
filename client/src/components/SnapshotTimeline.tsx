import { useCallback, useEffect, useState } from 'react';
import { ApiError, snapshotsApi } from '../api';
import type { SnapshotDetail, SnapshotRestoreResult, SnapshotSummary } from '../api';
import { Alert, Button, Empty, Skeleton } from './ui';
import './SnapshotTimeline.css';

const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const errorMessage = (reason: unknown, fallback: string) => reason instanceof ApiError ? reason.message : fallback;

export default function SnapshotTimeline({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> }) {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SnapshotDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [restoringHash, setRestoringHash] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<SnapshotRestoreResult | null>(null);

  const loadSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshots((await snapshotsApi.listSnapshots(projectId)).snapshots);
    } catch (reason) {
      console.error('快照时间线加载失败', reason);
      setError(errorMessage(reason, '快照时间线加载失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);

  const loadDetail = async (hash: string) => {
    setDetailLoading(hash);
    setDetailErrors((current) => { const next = { ...current }; delete next[hash]; return next; });
    try {
      const detail = await snapshotsApi.getSnapshot(hash);
      setDetails((current) => ({ ...current, [hash]: detail }));
    } catch (reason) {
      console.error('快照文件树加载失败', reason);
      setDetailErrors((current) => ({ ...current, [hash]: errorMessage(reason, '快照文件树加载失败，请稍后重试') }));
    } finally {
      setDetailLoading((current) => current === hash ? null : current);
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

  const restore = async (snapshot: SnapshotSummary) => {
    if (!globalThis.confirm(`确定恢复到快照 ${snapshot.hash.slice(0, 8)} 吗？此操作会生成新的恢复快照。`)) return;
    setRestoringHash(snapshot.hash);
    setRestoreError(null);
    setRestoreResult(null);
    try {
      const result = await snapshotsApi.restoreSnapshot(snapshot.hash);
      setRestoreResult(result);
      await loadSnapshots();
      await onChanged();
    } catch (reason) {
      console.error('快照恢复失败', reason);
      setRestoreError(errorMessage(reason, '快照恢复失败，请稍后重试'));
    } finally {
      setRestoringHash(null);
    }
  };

  if (loading) return <Skeleton rows={4} />;
  if (error) return <Alert action={<Button type="button" variant="danger" onClick={() => void loadSnapshots()}>重试</Button>}>{error}</Alert>;
  if (snapshots.length === 0) return <Empty title="暂无快照" />;

  return <div className="project-snapshot-panel">
    {restoreError && <Alert>{restoreError}</Alert>}
    {restoreResult && <div className="snapshot-restore-result">
      <Alert tone="success">恢复 {restoreResult.restoredFiles} 个文件</Alert>
      {restoreResult.skipped.length > 0 && <Alert tone="warning">部分文件未能恢复</Alert>}
      {restoreResult.skipped.length > 0 && <ul aria-label="未恢复文件清单">{restoreResult.skipped.map((item) => <li key={`${item.fileId}-${item.path}`}><strong>{item.path}</strong><span>{item.reason}</span></li>)}</ul>}
    </div>}
    <ol className="project-snapshot-timeline">
      {snapshots.map((snapshot, index) => {
        const expanded = expandedHash === snapshot.hash;
        const detail = details[snapshot.hash];
        return <li key={snapshot.hash} className="project-snapshot-item">
          <div className="snapshot-marker" aria-hidden="true" />
          <article>
            <div className="snapshot-heading">
              <button type="button" className="snapshot-toggle" onClick={() => toggle(snapshot.hash)} aria-expanded={expanded}>
                <span>{snapshot.message}</span>
                {index === 0 && <small>当前</small>}
              </button>
            </div>
            <div className="snapshot-meta">
              <time dateTime={snapshot.createdAt}>{formatTime(snapshot.createdAt)}</time>
              <span>{snapshot.author}</span>
              <span>{snapshot.entryCount} 个文件</span>
              <code title={snapshot.hash}>{snapshot.hash.slice(0, 8)}</code>
              <Button type="button" variant="ghost" onClick={() => toggle(snapshot.hash)}>{expanded ? '收起文件树' : '展开文件树'}</Button>
              {index > 0 && <Button type="button" variant="primary" onClick={() => restore(snapshot)} disabled={restoringHash === snapshot.hash}>{restoringHash === snapshot.hash ? '恢复中…' : '恢复到此快照'}</Button>}
            </div>
            {expanded && <div className="snapshot-detail">
              {detailLoading === snapshot.hash && <Skeleton rows={2} />}
              {detailErrors[snapshot.hash] && <Alert action={<Button type="button" variant="danger" onClick={() => void loadDetail(snapshot.hash)}>重试</Button>}>{detailErrors[snapshot.hash]}</Alert>}
              {!detailLoading && !detailErrors[snapshot.hash] && detail && (
                detail.entries.length === 0
                  ? <Empty title="快照为空" />
                  : <ol className="snapshot-file-tree">{detail.entries.map((entry) => <li key={`${entry.fileId}-${entry.path}`}><strong>{entry.path}</strong><span>{entry.uploader}</span><time dateTime={entry.uploadedAt}>{formatTime(entry.uploadedAt)}</time><code title={entry.version}>{entry.version.slice(0, 8)}</code></li>)}</ol>
              )}
            </div>}
          </article>
        </li>;
      })}
    </ol>
  </div>;
}
