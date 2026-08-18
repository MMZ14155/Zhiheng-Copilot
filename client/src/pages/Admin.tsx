import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi, ApiError, projectsApi, type AdminUser, type ProjectListItem, type ProjectMember, type ProjectMemberRole } from '../api';
import { Alert, Badge, Button, Card, Empty, Input, Select, Skeleton, Table } from '../components/ui';
import LlmConfigSection from '../components/LlmConfigSection';

const errorMessage = (reason: unknown, fallback: string) => reason instanceof ApiError ? reason.message : fallback;
const roleLabels: Record<ProjectMemberRole, string> = { manager: '项目负责人', implementer: '工作人员' };

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ProjectMemberRole>('implementer');
  const [assigning, setAssigning] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [nextUsers, projectList] = await Promise.all([
        adminApi.listUsers(),
        projectsApi.listProjects({ page: 1, size: 100 }),
      ]);
      setUsers(nextUsers);
      setProjects(projectList.items);
      setSelectedProjectId((current) => current || (projectList.items[0] ? String(projectList.items[0].id) : ''));
    } catch (reason) {
      console.error('管理数据加载失败', reason);
      setLoadError(errorMessage(reason, '管理数据加载失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async (projectId: number) => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      setMembers(await adminApi.listProjectMembers(projectId));
    } catch (reason) {
      console.error('项目成员加载失败', reason);
      setMembersError(errorMessage(reason, '项目成员加载失败，请稍后重试'));
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    if (!selectedProjectId) { setMembers([]); return; }
    void loadMembers(Number(selectedProjectId));
  }, [loadMembers, selectedProjectId]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setAccountError(null);
    if (!login.trim() || !name.trim() || !password) {
      setAccountError('请完整填写登录名、姓名和密码');
      return;
    }
    setCreating(true);
    try {
      await adminApi.createUser({ login: login.trim(), name: name.trim(), password, is_admin: isAdmin });
      setLogin(''); setName(''); setPassword(''); setIsAdmin(false);
      setUsers(await adminApi.listUsers());
    } catch (reason) {
      console.error('账号创建失败', reason);
      setAccountError(errorMessage(reason, '账号创建失败，请稍后重试'));
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setAccountError(null);
    try {
      await adminApi.deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      setUsers(await adminApi.listUsers());
      if (selectedProjectId) await loadMembers(Number(selectedProjectId));
    } catch (reason) {
      console.error('账号删除失败', reason);
      setAccountError(errorMessage(reason, '账号删除失败，请稍后重试'));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const assignMember = async (event: FormEvent) => {
    event.preventDefault();
    setMemberActionError(null);
    if (!selectedProjectId || !selectedUserId) {
      setMemberActionError('请选择项目和用户');
      return;
    }
    setAssigning(true);
    try {
      await adminApi.assignMember(Number(selectedProjectId), { user_id: Number(selectedUserId), role: selectedRole });
      setSelectedUserId('');
      await loadMembers(Number(selectedProjectId));
    } catch (reason) {
      console.error('项目成员添加失败', reason);
      setMemberActionError(errorMessage(reason, '项目成员添加失败，请稍后重试'));
    } finally {
      setAssigning(false);
    }
  };

  const removeMember = async (userId: number) => {
    if (!selectedProjectId) return;
    setRemovingUserId(userId);
    setMemberActionError(null);
    try {
      await adminApi.removeMember(Number(selectedProjectId), userId);
      await loadMembers(Number(selectedProjectId));
    } catch (reason) {
      console.error('项目成员移除失败', reason);
      setMemberActionError(errorMessage(reason, '项目成员移除失败，请稍后重试'));
    } finally {
      setRemovingUserId(null);
    }
  };

  return <div className="page-container admin-page">
    <div className="admin-page-heading"><div><h2 className="page-title">系统管理</h2><p>统一维护登录账号与项目成员角色。</p></div><Button variant="secondary" type="button" onClick={() => void loadOverview()} disabled={loading}>{loading ? '加载中…' : '刷新数据'}</Button></div>
    {loading && <Card><Skeleton rows={4} /></Card>}
    {!loading && loadError && <Alert action={<Button variant="secondary" type="button" onClick={() => void loadOverview()}>重试</Button>}>{loadError}</Alert>}
    {!loading && !loadError && <div className="admin-sections">
      <Card className="admin-section">
        <div className="admin-section-title"><div><h3>账号管理</h3><p>创建登录账号并维护管理员权限。</p></div><Badge tone="primary">{users.length} 个账号</Badge></div>
        <form className="admin-form account-form" onSubmit={(event) => void createUser(event)} noValidate>
          <label>登录名<Input aria-label="登录名" value={login} maxLength={80} onChange={(event) => setLogin(event.target.value)} /></label>
          <label>姓名<Input aria-label="姓名" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label>
          <label>密码<Input aria-label="密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="admin-checkbox"><input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />设为管理员</label>
          <Button type="submit" disabled={creating}>{creating ? '创建中…' : '新建账号'}</Button>
        </form>
        {accountError && <Alert>{accountError}</Alert>}
        {users.length === 0 ? <Empty title="暂无账号" description="请先创建一个登录账号。" /> : <Table label="账号列表"><thead><tr><th>登录名</th><th>姓名</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.login}</td><td>{user.name}</td><td><Badge tone={user.isAdmin ? 'violet' : 'neutral'}>{user.isAdmin ? '管理员' : '普通用户'}</Badge></td><td>{new Date(user.createdAt).toLocaleString('zh-CN')}</td><td><Button variant="ghost" type="button" onClick={() => setDeleteTarget(user)}>删除</Button></td></tr>)}</tbody></Table>}
      </Card>

      <Card className="admin-section">
        <div className="admin-section-title"><div><h3>项目成员分配</h3><p>为项目设置负责人或工作人员。</p></div></div>
        {projects.length === 0 ? <Empty title="暂无项目" description="创建项目后即可分配成员。" /> : <>
          <label className="project-picker">选择项目<Select aria-label="选择项目" value={selectedProjectId} onChange={(event) => { setSelectedProjectId(event.target.value); setMemberActionError(null); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}（{project.code}）</option>)}</Select></label>
          <form className="admin-form member-form" onSubmit={(event) => void assignMember(event)} noValidate>
            <label>添加用户<Select aria-label="添加用户" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}><option value="">请选择用户</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}（{user.login}）</option>)}</Select></label>
            <label>成员角色<Select aria-label="成员角色" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as ProjectMemberRole)}><option value="manager">项目负责人</option><option value="implementer">工作人员</option></Select></label>
            <Button type="submit" disabled={assigning || users.length === 0}>{assigning ? '添加中…' : '添加成员'}</Button>
          </form>
          {memberActionError && <Alert>{memberActionError}</Alert>}
          {membersLoading && <Skeleton rows={2} />}
          {!membersLoading && membersError && <Alert action={<Button variant="secondary" type="button" onClick={() => void loadMembers(Number(selectedProjectId))}>重试</Button>}>{membersError}</Alert>}
          {!membersLoading && !membersError && (members.length === 0 ? <Empty title="暂无项目成员" description="从上方选择用户并分配角色。" /> : <Table label="项目成员列表"><thead><tr><th>姓名</th><th>登录名</th><th>角色</th><th>操作</th></tr></thead><tbody>{members.map((member) => <tr key={member.userId}><td>{member.name}</td><td>{member.login}</td><td><Badge tone={member.role === 'manager' ? 'primary' : 'neutral'}>{roleLabels[member.role]}</Badge></td><td><Button variant="ghost" type="button" disabled={removingUserId === member.userId} onClick={() => void removeMember(member.userId)}>{removingUserId === member.userId ? '移除中…' : '移除'}</Button></td></tr>)}</tbody></Table>)}
        </>}
      </Card>
      <LlmConfigSection />
    </div>}
    {deleteTarget && <div className="admin-dialog-backdrop"><section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-user-title"><h3 id="delete-user-title">确认删除账号</h3><p>确定删除“{deleteTarget.name}（{deleteTarget.login}）”吗？删除后该账号的会话将失效。</p><div><Button variant="secondary" type="button" disabled={deleting} onClick={() => setDeleteTarget(null)}>取消</Button><Button variant="danger" type="button" disabled={deleting} onClick={() => void confirmDelete()}>{deleting ? '删除中…' : '确认删除'}</Button></div></section></div>}
  </div>;
}
