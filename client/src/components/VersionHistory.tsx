import { useCallback, useState } from 'react';
import { ApiError, deliverablesApi, filesApi } from '../api';
import type { ProjectDeliverable, TrackedFile } from '../api';

interface VersionHistoryProps {
  projectId: number;
  deliverables: ProjectDeliverable[];
}

const formatDateTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function VersionHistory({ projectId, deliverables }: VersionHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [trackedFiles, setTrackedFiles] = useState<TrackedFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrackedFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTrackedFiles(await deliverablesApi.listTrackedFiles(projectId));
    } catch (reason) {
      console.error('交付物版本历史加载失败', reason);
      setError(reason instanceof ApiError ? reason.message : '版本历史加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const toggle = (deliverableId: string) => {
    const nextId = expandedId === deliverableId ? null : deliverableId;
    setExpandedId(nextId);
    if (nextId !== null && trackedFiles === null && !loading) void loadTrackedFiles();
  };

  if (deliverables.length === 0) return <p className="detail-empty">暂无交付物</p>;

  return <div className="deliverable-list">
    {deliverables.map((deliverable) => {
      const expanded = expandedId === deliverable.id;
      const trackedFile = trackedFiles?.find((item) => item.id === deliverable.id);
      return <article className="deliverable-item" key={deliverable.id}>
        <button type="button" className="deliverable-toggle" aria-expanded={expanded} onClick={() => toggle(deliverable.id)}>
          <span>{deliverable.name}</span>
          <small>更新时间 {formatDateTime(deliverable.updatedAt)}</small>
          <span className="deliverable-chevron" aria-hidden="true">{expanded ? '收起' : '展开'}</span>
        </button>
        {expanded && <div className="version-history">
          {loading && <p className="version-state" role="status">正在加载版本历史…</p>}
          {!loading && error && <div className="version-state version-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadTrackedFiles()}>重试</button></div>}
          {!loading && !error && trackedFile === undefined && <p className="version-state">暂无版本历史</p>}
          {!loading && !error && trackedFile !== undefined && trackedFile.versions.length === 0 && <p className="version-state">该交付物暂无文件版本</p>}
          {!loading && !error && trackedFile !== undefined && trackedFile.versions.length > 0 && <ol className="version-chain">
            {trackedFile.versions.map((version) => <li className={version.isCurrent ? 'version-item is-current' : 'version-item'} key={version.version}>
              <div className="version-heading">
                <code title={version.version}>{version.version.slice(0, 8)}</code>
                {version.isCurrent && <span className="version-badge current">当前生效</span>}
                {version.isFrozen && <span className="version-badge frozen">已冻结</span>}
                <a href={filesApi.getVersionDownloadUrl(version.version)} target="_blank" rel="noreferrer">下载</a>
              </div>
              <dl className="version-meta">
                <div><dt>上传人</dt><dd>{version.uploadedBy || '未知'}</dd></div>
                <div><dt>上传时间</dt><dd>{formatDateTime(version.uploadedAt)}</dd></div>
                <div><dt>文件大小</dt><dd>{formatSize(version.sizeBytes)}</dd></div>
                <div className="version-changelog"><dt>变更说明</dt><dd>{version.changelog || '无'}</dd></div>
              </dl>
            </li>)}
          </ol>}
        </div>}
      </article>;
    })}
  </div>;
}
