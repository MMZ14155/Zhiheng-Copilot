import { useState } from 'react';
import { ApiError, deliverablesApi, filesApi } from '../api';
import type { DeliverableCategoryDto } from '../api';

type KnownFile = { id: number; name: string; version: string; promoted: boolean };
const categories: DeliverableCategoryDto[] = ['合同', '成本明细', '验收材料', '检测报告', '交付成果'];
const accept = '.pdf,.docx,.xlsx,.jpg,.jpeg,.png';
const message = (reason: unknown, fallback: string) => reason instanceof ApiError ? reason.message : fallback;

export default function ProcessFiles({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> }) {
  const [items, setItems] = useState<KnownFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [docType, setDocType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async () => {
    if (!file) return setError('请选择需要上传的文件');
    setBusy(true); setError(null);
    try {
      const displayName = name.trim() || file.name;
      const result = await filesApi.createFile(projectId, { name: displayName, file, uploadedBy: 'web-user', changelog: note.trim() || undefined, docType: docType || undefined });
      setItems((old) => [...old, { id: result.file_id, name: displayName, version: result.version, promoted: false }]);
      setFile(null); setName(''); setNote(''); setDocType('');
    } catch (reason) { console.error('过程文件上传失败', reason); setError(message(reason, '文件上传失败，请稍后重试')); }
    finally { setBusy(false); }
  };
  const update = (id: number, patch: Partial<KnownFile>) => setItems((old) => old.map((item) => item.id === id ? { ...item, ...patch } : item));
  return <div className="process-files">
    <p className="process-file-note">服务端暂未提供过程文件查询接口，此处仅展示本次打开页面后上传的文件。</p>
    <div className="process-upload-form">
      <label>选择文件<input type="file" accept={accept} disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>文件名称<input value={name} disabled={busy} placeholder={file?.name ?? '默认使用所选文件名'} onChange={(e) => setName(e.target.value)} /></label>
      <label>上传人<input value="web-user" disabled /></label>
      <label>材料类型<select value={docType} disabled={busy} onChange={(e) => setDocType(e.target.value)}><option value="">普通材料</option><option value="contract">合同</option><option value="invoice">发票</option><option value="payment">付款材料</option></select></label>
      <label className="process-wide">变更说明<textarea rows={2} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => void upload()}>{busy ? '上传中…' : '上传新文件'}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    {!items.length ? <p className="detail-empty">本次会话尚未上传过程文件</p> : <div className="process-file-list">{items.map((item) => <FileItem key={item.id} projectId={projectId} item={item} update={(patch) => update(item.id, patch)} onChanged={onChanged} />)}</div>}
  </div>;
}

function FileItem({ projectId, item, update, onChanged }: { projectId: number; item: KnownFile; update: (patch: Partial<KnownFile>) => void; onChanged: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<DeliverableCategoryDto>('交付成果');
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState<'append' | 'promote' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const append = async () => {
    if (!file) return setError('请选择新版本文件');
    setBusy('append'); setError(null);
    try { const result = await filesApi.appendFileVersion(item.id, { file, uploadedBy: 'web-user', changelog: note.trim() || undefined }); update({ version: result.version }); setFile(null); setNote(''); }
    catch (reason) { console.error('追加版本失败', reason); setError(message(reason, '追加版本失败，请稍后重试')); }
    finally { setBusy(null); }
  };
  const promote = async () => {
    setBusy('promote'); setError(null);
    try { await deliverablesApi.promoteTrackedFile(projectId, { source_file_id: item.id, category, required }); update({ promoted: true }); await onChanged(); }
    catch (reason) { console.error('升格失败', reason); setError(message(reason, '升格失败，请稍后重试')); }
    finally { setBusy(null); }
  };
  return <article className="process-file-item"><div><strong>{item.name}</strong> <code>{item.version.slice(0, 8)}</code> {item.promoted && <span className="version-badge frozen">已升格并冻结</span>}</div>
    {!item.promoted && <><div className="inline-file-action"><input type="file" accept={accept} disabled={busy !== null} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /><input value={note} placeholder="新版本变更说明" onChange={(e) => setNote(e.target.value)} /><button type="button" disabled={busy !== null} onClick={() => void append()}>{busy === 'append' ? '追加中…' : '追加版本'}</button></div><div className="inline-file-action"><select value={category} onChange={(e) => setCategory(e.target.value as DeliverableCategoryDto)}>{categories.map((value) => <option key={value}>{value}</option>)}</select><label><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />必须交付</label><button type="button" disabled={busy !== null} onClick={() => void promote()}>{busy === 'promote' ? '升格中…' : '升格为交付物'}</button></div></>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </article>;
}
