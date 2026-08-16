import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError, deliverablesApi, filesApi, getAuthUser, subscribeAuth } from '../api';
import type { DeliverableCategoryDto, ProjectFile } from '../api';

const categories: DeliverableCategoryDto[] = ['合同', '成本明细', '验收材料', '检测报告', '交付成果'];
const accept = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png';
const message = (reason: unknown, fallback: string) => reason instanceof ApiError ? reason.message : fallback;

export default function ProcessFiles({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> }) {
  const currentUser = useSyncExternalStore(subscribeAuth, getAuthUser, getAuthUser);
  const [items, setItems] = useState<ProjectFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [docType, setDocType] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await filesApi.listProjectFiles(projectId)); }
    catch (reason) { console.error('过程文件列表加载失败', reason); setError(message(reason, '过程文件加载失败，请稍后重试')); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const upload = async () => {
    if (!file) return setError('请选择需要上传的文件');
    setBusy(true); setError(null);
    try {
      await filesApi.createFile(projectId, { name: name.trim() || file.name, file, changelog: note.trim() || undefined, docType: docType || undefined });
      setFile(null); setName(''); setNote(''); setDocType('');
      await loadFiles();
    } catch (reason) { console.error('过程文件上传失败', reason); setError(message(reason, '文件上传失败，请稍后重试')); }
    finally { setBusy(false); }
  };

  return <div className="process-files">
    <div className="process-upload-form">
      <label>选择文件<input type="file" accept={accept} disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>文件名称<input value={name} disabled={busy} placeholder={file?.name ?? '默认使用所选文件名'} onChange={(e) => setName(e.target.value)} /></label>
      <label>上传人<input value={currentUser?.name ?? '加载中…'} disabled /></label>
      <label>材料类型<select value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value)}><option value="">普通材料</option><option value="contract">合同</option><option value="invoice">发票</option><option value="payment">付款材料</option></select></label>
      <label className="process-wide">变更说明<textarea rows={2} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void upload()}>{busy ? '上传中…' : '上传新文件'}</button>
    </div>
    {loading && <p className="detail-empty" role="status">正在加载过程文件…</p>}
    {!loading && error && <div className="inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadFiles()}>重试</button></div>}
    {!loading && !error && !items.length && <p className="detail-empty">暂无过程文件</p>}
    {!loading && !error && items.length > 0 && <div className="process-file-list">{items.map((item) => <FileItem key={item.id} projectId={projectId} item={item} refresh={loadFiles} onChanged={onChanged} />)}</div>}
  </div>;
}

function FileItem({ projectId, item, refresh, onChanged }: { projectId: number; item: ProjectFile; refresh: () => Promise<void>; onChanged: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<DeliverableCategoryDto>('交付成果');
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState<'append' | 'promote' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const append = async () => {
    if (!file) return setError('请选择新版本文件');
    setBusy('append'); setError(null);
    try { await filesApi.appendFileVersion(item.id, { file, changelog: note.trim() || undefined }); setFile(null); setNote(''); await refresh(); }
    catch (reason) { console.error('追加版本失败', reason); setError(message(reason, '追加版本失败，请稍后重试')); }
    finally { setBusy(null); }
  };
  const promote = async () => {
    setBusy('promote'); setError(null);
    try { await deliverablesApi.promoteTrackedFile(projectId, { source_file_id: item.id, category, required }); await Promise.all([refresh(), onChanged()]); }
    catch (reason) { console.error('升格失败', reason); setError(message(reason, '升格失败，请稍后重试')); }
    finally { setBusy(null); }
  };
  return <article className="process-file-item"><div><strong>{item.name}</strong> {item.latestVersion && <code title={item.latestVersion.version}>{item.latestVersion.version.slice(0, 8)}</code>} {item.isDeliverable && <span className="version-badge frozen">已升格</span>}</div>
    {!item.isDeliverable && <><div className="inline-file-action"><input type="file" accept={accept} disabled={busy !== null} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><input value={note} disabled={busy !== null} placeholder="新版本变更说明" onChange={(e) => setNote(e.target.value)} /><button type="button" disabled={busy !== null} onClick={() => void append()}>{busy === 'append' ? '追加中…' : '追加版本'}</button></div><div className="inline-file-action"><select value={category} disabled={busy !== null} onChange={(e) => setCategory(e.target.value as DeliverableCategoryDto)}>{categories.map((value) => <option key={value}>{value}</option>)}</select><label><input type="checkbox" checked={required} disabled={busy !== null} onChange={(e) => setRequired(e.target.checked)} />必须交付</label><button type="button" disabled={busy !== null} onClick={() => void promote()}>{busy === 'promote' ? '升格中…' : '升格为交付物'}</button></div></>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}
