import { useEffect, useId, useState, type ReactNode, type FormEvent } from 'react';
import { ApiError, projectsApi, type ProjectPartyDto, type ProjectWriteDto } from '../api';
import './CreateProjectModal.css';

type Field = 'name' | 'code' | 'customerName' | 'contractAmount' | 'signedDate' | 'startedDate' | 'deliveryDate' | 'progress' | 'notes';
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;
const initial: Values = { name:'', code:'', customerName:'', contractAmount:'', signedDate:'', startedDate:'', deliveryDate:'', progress:'', notes:'' };

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = '请输入项目名称';
  if (!v.code.trim()) e.code = '请输入项目编号';
  if (!v.customerName.trim()) e.customerName = '请输入客户名称';
  if (v.contractAmount && (!Number.isFinite(Number(v.contractAmount)) || Number(v.contractAmount) <= 0)) e.contractAmount = '合同金额必须大于 0';
  if (v.progress && (!Number.isFinite(Number(v.progress)) || Number(v.progress) < 0 || Number(v.progress) > 100)) e.progress = '进度必须在 0 到 100 之间';
  if (v.signedDate && v.startedDate && v.signedDate > v.startedDate) e.startedDate = '启动日期不能早于签约日期';
  if (v.startedDate && v.deliveryDate && v.startedDate > v.deliveryDate) e.deliveryDate = '计划交付日期不能早于启动日期';
  if (!v.startedDate && v.signedDate && v.deliveryDate && v.signedDate > v.deliveryDate) e.deliveryDate = '计划交付日期不能早于签约日期';
  return e;
}

export default function CreateProjectModal({ onClose, onCreated }: { onClose:()=>void; onCreated:()=>void|Promise<void> }) {
  const titleId = useId();
  const [values, setValues] = useState(initial);
  const [parties, setParties] = useState<ProjectPartyDto[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [apiError, setApiError] = useState<string|null>(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (field: Field, value: string) => { setValues(v => ({...v,[field]:value})); setErrors(e => ({...e,[field]:undefined})); };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [onClose, submitting]);
  const updateParty = (index:number, field:keyof ProjectPartyDto, value:string) => setParties(rows => rows.map((row,i) => i === index ? {...row,[field]:value} : row));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const next = validate(values); setErrors(next); setApiError(null); if (Object.keys(next).length) return;
    const body: ProjectWriteDto = {
      name:values.name.trim(), code:values.code.trim(), customer_name:values.customerName.trim(),
      contract_amount:values.contractAmount ? Number(values.contractAmount) : null,
      signed_date:values.signedDate || null, started_date:values.startedDate || null,
      planned_delivery_date:values.deliveryDate || null, progress:values.progress ? Number(values.progress) : 0,
      notes:values.notes.trim() || null,
      parties:parties.map(p => ({role:p.role.trim(),name:p.name.trim(),contact:p.contact?.trim() || null})).filter(p => p.role || p.name || p.contact),
    };
    setSubmitting(true);
    try { await projectsApi.createProject(body); await onCreated(); onClose(); }
    catch (reason) { console.error('项目创建失败', reason); setApiError(reason instanceof ApiError ? reason.message : '项目创建失败，请稍后重试'); }
    finally { setSubmitting(false); }
  };
  return <div className="create-project-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
    <section className="create-project-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><h2 id={titleId}>新建项目</h2><p>填写项目基本信息，带 * 的字段为必填项。</p></div><button type="button" aria-label="关闭新建项目弹窗" onClick={onClose} disabled={submitting}>×</button></header>
      <form onSubmit={e => void submit(e)} noValidate>
        {apiError && <div className="form-submit-error" role="alert">{apiError}</div>}
        <div className="project-form-grid">
          <Field label="项目名称" required error={errors.name}><input autoFocus maxLength={200} value={values.name} onChange={e=>set('name',e.target.value)}/></Field>
          <Field label="项目编号" required error={errors.code}><input maxLength={80} value={values.code} onChange={e=>set('code',e.target.value)}/></Field>
          <Field label="客户名称" required error={errors.customerName}><input maxLength={200} value={values.customerName} onChange={e=>set('customerName',e.target.value)}/></Field>
          <Field label="合同金额" error={errors.contractAmount}><input type="number" min="0" step="0.01" value={values.contractAmount} onChange={e=>set('contractAmount',e.target.value)}/></Field>
          <Field label="签约日期"><input type="date" value={values.signedDate} onChange={e=>set('signedDate',e.target.value)}/></Field>
          <Field label="启动日期" error={errors.startedDate}><input type="date" value={values.startedDate} onChange={e=>set('startedDate',e.target.value)}/></Field>
          <Field label="计划交付日期" error={errors.deliveryDate}><input type="date" value={values.deliveryDate} onChange={e=>set('deliveryDate',e.target.value)}/></Field>
          <Field label="进度" error={errors.progress}><input type="number" min="0" max="100" value={values.progress} onChange={e=>set('progress',e.target.value)}/></Field>
        </div>
        <div className="parties-section"><div className="section-heading"><div><h3>签约方</h3><span>可选，支持添加多个签约方</span></div><button type="button" className="secondary-button" onClick={()=>setParties(p=>[...p,{role:'',name:'',contact:null}])}>+ 添加签约方</button></div>
          {!parties.length && <div className="parties-empty">暂未添加签约方</div>}
          {parties.map((p,i)=><div className="party-row" key={i}><label>角色<input value={p.role} onChange={e=>updateParty(i,'role',e.target.value)}/></label><label>名称<input value={p.name} onChange={e=>updateParty(i,'name',e.target.value)}/></label><label>联系方式<input value={p.contact??''} onChange={e=>updateParty(i,'contact',e.target.value)}/></label><button type="button" aria-label={`删除第 ${i+1} 个签约方`} onClick={()=>setParties(rows=>rows.filter((_,j)=>j!==i))}>删除</button></div>)}
        </div>
        <Field label="备注"><textarea rows={4} maxLength={10000} value={values.notes} onChange={e=>set('notes',e.target.value)}/></Field>
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>取消</button><button className="primary-button" disabled={submitting}>{submitting?'创建中…':'创建项目'}</button></div>
      </form>
    </section>
  </div>;
}
function Field({label,required,error,children}:{label:string;required?:boolean;error?:string;children:ReactNode}) { return <label className={`project-form-field${error?' invalid':''}`}><span>{label}{required&&<b> *</b>}</span>{children}{error&&<small role="alert">{error}</small>}</label>; }
