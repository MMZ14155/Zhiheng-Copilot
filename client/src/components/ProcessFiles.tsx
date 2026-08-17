import { useCallback, useEffect, useState } from 'react';
import { ApiError, filesApi } from '../api';
import type { ProjectFile } from '../api';

const accept = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png';
const message = (reason: unknown, fallback: string) => reason instanceof ApiError ? reason.message : fallback;

type PendingOperation =
  | { id: string; op: 'add'; name: string; file: File; docType: string; changelog: string }
  | { id: string; op: 'update'; fileId: number; name: string; file: File; changelog: string }
  | { id: string; op: 'remove'; fileId: number; name: string };

const formatTime = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function ProcessFiles({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<ProjectFile[]>([]);
  const [pending, setPending] = useState<PendingOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  // 新增文件表单
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newName, setNewName] = useState('');
  const [newDocType, setNewDocType] = useState('');
  const [newChangelog, setNewChangelog] = useState('');

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await filesApi.listProjectFiles(projectId)); }
    catch (reason) { console.error('过程文件列表加载失败', reason); setError(message(reason, '过程文件加载失败，请稍后重试')); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const addPending = (op: PendingOperation) => setPending((current) => [...current, op]);
  const cancelPending = (id: string) => setPending((current) => current.filter((item) => item.id !== id));

  const stageAdd = () => {
    if (!newFile) return setCommitError('请先选择要新增的文件');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addPending({ id, op: 'add', name: newName.trim() || newFile.name, file: newFile, docType: newDocType, changelog: newChangelog.trim() });
    setNewFile(null); setNewName(''); setNewDocType(''); setNewChangelog(''); setCommitError(null);
  };

  const stageUpdate = (fileId: number, name: string, file: File, changelog: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addPending({ id, op: 'update', fileId, name, file, changelog: changelog.trim() });
  };

  const stageRemove = (fileId: number, name: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    addPending({ id, op: 'remove', fileId, name });
  };

  const commit = async () => {
    if (!commitMessage.trim()) return setCommitError('请输入提交说明');
    if (pending.length === 0) return setCommitError('没有待提交的改动');
    setCommitting(true); setCommitError(null);
    try {
      const operations = pending.map((op) => {
        if (op.op === 'add') return { op: 'add' as const, name: op.name, file: op.file, docType: op.docType || undefined, changelog: op.changelog || undefined };
        if (op.op === 'update') return { op: 'update' as const, fileId: op.fileId, file: op.file, changelog: op.changelog || undefined };
        return { op: 'remove' as const, fileId: op.fileId };
      });
      await filesApi.workspaceCommit(projectId, { message: commitMessage.trim(), operations });
      setPending([]); setCommitMessage('');
      await loadFiles();
      await onChanged();
    } catch (reason) {
      console.error('工作区提交失败', reason);
      setCommitError(message(reason, '提交失败，请稍后重试'));
    } finally { setCommitting(false); }
  };

  return <div className="process-files">
    <div className="process-workspace-add">
      <h4>新增文件</h4>
      <div className="process-upload-form">
        <label>选择文件<input type="file" accept={accept} onChange={(e) => { const f = e.target.files?.[0] ?? null; setNewFile(f); if (f && !newName) setNewName(f.name); }} /></label>
        <label>文件名称<input value={newName} placeholder={newFile?.name ?? '默认使用所选文件名'} onChange={(e) => setNewName(e.target.value)} /></label>
        <label>材料类型<select value={newDocType} onChange={(e) => setNewDocType(e.target.value)}><option value="">普通材料</option><option value="contract">合同</option><option value="invoice">发票</option><option value="payment">付款材料</option></select></label>
        <label className="process-wide">变更说明<textarea rows={2} value={newChangelog} onChange={(e) => setNewChangelog(e.target.value)} /></label>
        <button type="button" onClick={() => stageAdd()}>加入改动</button>
      </div>
    </div>

    {loading && <p className="detail-empty" role="status">正在加载过程文件…</p>}
    {!loading && error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadFiles()}>重试</button></div>}
    {!loading && !error && items.length === 0 && pending.length === 0 && <p className="detail-empty">暂无过程文件</p>}
    {!loading && !error && (items.length > 0 || pending.length > 0) && <>
      <h4>当前文件</h4>
      <div className="process-file-list">{items.map((item) => {
        const isPendingRemove = pending.some((p) => p.op === 'remove' && p.fileId === item.id);
        const pendingUpdate = pending.find((p) => p.op === 'update' && p.fileId === item.id) as Extract<PendingOperation, { op: 'update' }> | undefined;
        return <div key={item.id}>
          <article className={isPendingRemove ? 'process-file-item pending-remove' : 'process-file-item'}>
            <div className="process-file-main">
              <strong>{item.name}</strong>
              {item.latestVersion && <code title={item.latestVersion.version}>{item.latestVersion.version.slice(0, 8)}</code>}
              {item.isDeliverable && <span className="version-badge frozen">已升格</span>}
              {isPendingRemove && <span className="version-badge danger">待移除</span>}
            </div>
            {item.latestVersion && <div className="process-file-meta">
              <span>{item.latestVersion.parseStatus}</span>
              <time dateTime={item.latestVersion.uploadedAt}>{formatTime(item.latestVersion.uploadedAt)}</time>
            </div>}
            {!isPendingRemove && !pendingUpdate && <div className="process-file-actions">
              <ReplaceButton onSelect={(file, changelog) => stageUpdate(item.id, item.name, file, changelog)} />
              <button type="button" className="secondary danger" onClick={() => stageRemove(item.id, item.name)}>移除</button>
            </div>}
            {isPendingRemove && <button type="button" onClick={() => { const p = pending.find((x) => x.op === 'remove' && x.fileId === item.id); if (p) cancelPending(p.id); }}>撤销移除</button>}
          </article>
          {pendingUpdate && <div className="process-pending-update">
            <span>替换为 {pendingUpdate.file.name}</span>
            <input type="text" value={pendingUpdate.changelog} placeholder="变更说明" onChange={(e) => {
              const value = e.target.value;
              setPending((current) => current.map((p) => p.id === pendingUpdate.id ? { ...p, changelog: value } as PendingOperation : p));
            }} />
            <button type="button" onClick={() => cancelPending(pendingUpdate.id)}>撤销</button>
          </div>}
        </div>;
      })}</div>
    </>}

    {pending.length > 0 && <div className="process-workspace-staging">
      <h4>待提交改动</h4>
      <ol>{pending.map((op) => <li key={op.id}>
        {op.op === 'add' && <><span className="op-badge add">新增</span><strong>{op.name}</strong><span>{op.docType ? `类型 ${op.docType}` : '普通材料'}</span></>}
        {op.op === 'update' && <><span className="op-badge update">修改</span><strong>{op.name}</strong><span>→ {op.file.name}</span></>}
        {op.op === 'remove' && <><span className="op-badge remove">移除</span><strong>{op.name}</strong></>}
        <button type="button" onClick={() => cancelPending(op.id)}>撤销</button>
      </li>)}</ol>
    </div>}

    <div className="process-workspace-commit">
      <label>提交说明<input value={commitMessage} disabled={committing} placeholder="描述本次改动" onChange={(e) => setCommitMessage(e.target.value)} /></label>
      <button type="button" disabled={committing || pending.length === 0} onClick={() => void commit()}>{committing ? '提交中…' : `提交改动 (${pending.length})`}</button>
      {commitError && <p className="form-error" role="alert">{commitError}</p>}
    </div>
  </div>;
}

function ReplaceButton({ onSelect }: { onSelect: (file: File, changelog: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [changelog, setChangelog] = useState('');
  const inputRef = { current: null as HTMLInputElement | null };
  return <div className="process-replace-inline">
    <input type="file" accept={accept} ref={(el) => { inputRef.current = el; }} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); }} style={{ display: file ? 'none' : 'inline' }} />
    {file && <>
      <span>{file.name}</span>
      <input type="text" value={changelog} placeholder="变更说明" onChange={(e) => setChangelog(e.target.value)} />
      <button type="button" onClick={() => { onSelect(file, changelog); setFile(null); setChangelog(''); if (inputRef.current) inputRef.current.value = ''; }}>确认替换</button>
      <button type="button" className="secondary" onClick={() => { setFile(null); setChangelog(''); if (inputRef.current) inputRef.current.value = ''; }}>取消</button>
    </>}
    {!file && <button type="button" className="secondary" onClick={() => inputRef.current?.click()}>替换</button>}
  </div>;
}

