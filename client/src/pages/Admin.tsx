import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage, type AdminUser } from "../api";
import { projectsApi, type ProjectListItem } from "../api";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Skeleton,
  Table,
  Tabs,
} from "../components/ui";
import LlmConfigSection from "../components/LlmConfigSection";

export default function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState("accounts");

  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<ProjectListItem | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await adminApi.listUsers());
    } catch (reason) {
      console.error("账号数据加载失败", reason);
      setLoadError(errorMessage(reason, "账号数据加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectError(null);
    try {
      const result = await projectsApi.listProjects({ size: 1000 });
      setProjects(result.items);
    } catch (reason) {
      console.error("项目数据加载失败", reason);
      setProjectError(errorMessage(reason, "项目数据加载失败，请稍后重试"));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const loadData = useCallback(() => {
    void loadUsers();
    void loadProjects();
  }, [loadUsers, loadProjects]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setAccountError(null);
    if (!login.trim() || !name.trim() || !password) {
      setAccountError("请完整填写登录名、姓名和密码");
      return;
    }
    setCreating(true);
    try {
      await adminApi.createUser({
        login: login.trim(),
        name: name.trim(),
        password,
        is_admin: isAdmin,
      });
      setLogin("");
      setName("");
      setPassword("");
      setIsAdmin(false);
      setUsers(await adminApi.listUsers());
    } catch (reason) {
      console.error("账号创建失败", reason);
      setAccountError(errorMessage(reason, "账号创建失败，请稍后重试"));
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
    } catch (reason) {
      console.error("账号删除失败", reason);
      setAccountError(errorMessage(reason, "账号删除失败，请稍后重试"));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteProject = async () => {
    if (!deleteProjectTarget) return;
    setDeletingProject(true);
    setProjectError(null);
    try {
      await adminApi.deleteProject(deleteProjectTarget.id);
      setDeleteProjectTarget(null);
      const result = await projectsApi.listProjects({ size: 1000 });
      setProjects(result.items);
    } catch (reason) {
      console.error("项目删除失败", reason);
      setProjectError(errorMessage(reason, "项目删除失败，请稍后重试"));
      setDeleteProjectTarget(null);
    } finally {
      setDeletingProject(false);
    }
  };

  return (
    <div className="page-container admin-page">
      <div className="admin-page-heading">
        <div>
          <h2 className="page-title">系统管理</h2>
          <p>统一维护登录账号与 AI 服务配置。</p>
        </div>
        <Button
          variant="secondary"
          type="button"
          onClick={() => void loadData()}
          disabled={loading || projectsLoading}
        >
          {loading || projectsLoading ? "加载中…" : "刷新数据"}
        </Button>
      </div>
      {loading && (
        <Card>
          <Skeleton rows={4} />
        </Card>
      )}
      {!loading && loadError && (
        <Alert
          action={
            <Button
              variant="secondary"
              type="button"
              onClick={() => void loadData()}
            >
              重试
            </Button>
          }
        >
          {loadError}
        </Alert>
      )}
      {!loading && !loadError && (
        <>
          <Tabs
            label="管理功能导航"
            active={activeTab}
            onChange={setActiveTab}
            tabs={[
              { key: "accounts", label: "账号管理" },
              { key: "projects", label: "项目管理" },
              { key: "ai", label: "AI 配置" },
            ]}
          />
          {activeTab === "accounts" && (
            <Card className="admin-section">
              <div className="admin-section-title">
                <div>
                  <h3>账号管理</h3>
                  <p>创建登录账号并维护管理员权限。</p>
                </div>
                <Badge tone="primary">{users.length} 个账号</Badge>
              </div>
              <form
                className="admin-form account-form"
                onSubmit={(event) => void createUser(event)}
                noValidate
              >
                <label>
                  登录名
                  <Input
                    aria-label="登录名"
                    value={login}
                    maxLength={80}
                    onChange={(event) => setLogin(event.target.value)}
                  />
                </label>
                <label>
                  姓名
                  <Input
                    aria-label="姓名"
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label>
                  密码
                  <Input
                    aria-label="密码"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="admin-checkbox">
                  <input
                    type="checkbox"
                    checked={isAdmin}
                    onChange={(event) => setIsAdmin(event.target.checked)}
                  />
                  设为管理员
                </label>
                <Button type="submit" disabled={creating}>
                  {creating ? "创建中…" : "新建账号"}
                </Button>
              </form>
              {accountError && <Alert>{accountError}</Alert>}
              {users.length === 0 ? (
                <Empty title="暂无账号" description="请先创建一个登录账号。" />
              ) : (
                <Table label="账号列表">
                  <thead>
                    <tr>
                      <th>登录名</th>
                      <th>姓名</th>
                      <th>角色</th>
                      <th>创建时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.login}</td>
                        <td>{user.name}</td>
                        <td>
                          <Badge tone={user.isAdmin ? "role" : "neutral"}>
                            {user.isAdmin ? "管理员" : "普通用户"}
                          </Badge>
                        </td>
                        <td>
                          {new Date(user.createdAt).toLocaleString("zh-CN")}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setDeleteTarget(user)}
                          >
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
          {activeTab === "ai" && <LlmConfigSection />}
          {activeTab === "projects" && (
            <Card className="admin-section">
              <div className="admin-section-title">
                <div>
                  <h3>项目管理</h3>
                  <p>查看全部项目并删除不再需要的项目。</p>
                </div>
                <Badge tone="primary">{projects.length} 个项目</Badge>
              </div>
              {projectError && <Alert>{projectError}</Alert>}
              {projectsLoading ? (
                <Skeleton rows={4} />
              ) : projects.length === 0 ? (
                <Empty title="暂无项目" description="系统中还没有创建项目。" />
              ) : (
                <Table label="项目列表">
                  <thead>
                    <tr>
                      <th>项目名称</th>
                      <th>客户名称</th>
                      <th>项目类型</th>
                      <th>状态</th>
                      <th>更新时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id}>
                        <td>{project.name}</td>
                        <td>{project.customerName}</td>
                        <td>{project.projectType ?? "-"}</td>
                        <td>
                          <Badge tone={project.status === "active" ? "success" : "neutral"}>
                            {project.status === "active" && "进行中"}
                            {project.status === "archived" && "已归档"}
                            {project.status === "completed" && "已完成"}
                          </Badge>
                        </td>
                        <td>
                          {project.updatedAt
                            ? new Date(project.updatedAt).toLocaleString("zh-CN")
                            : "-"}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setDeleteProjectTarget(project)}
                          >
                            删除
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
        </>
      )}
      {deleteTarget && (
        <div className="admin-dialog-backdrop">
          <section
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
          >
            <h3 id="delete-user-title">确认删除账号</h3>
            <p>
              确定删除“{deleteTarget.name}（{deleteTarget.login}
              ）”吗？删除后该账号的会话将失效。
            </p>
            <div>
              <Button
                variant="secondary"
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? "删除中…" : "确认删除"}
              </Button>
            </div>
          </section>
        </div>
      )}
      {deleteProjectTarget && (
        <div className="admin-dialog-backdrop">
          <section
            className="admin-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-project-title"
          >
            <h3 id="delete-project-title">确认删除项目</h3>
            <p>
              确定删除“{deleteProjectTarget.name}（{deleteProjectTarget.code}
              ）”吗？删除后将无法恢复，项目下的文件、摘要与快照也会被一并清理。
            </p>
            <div>
              <Button
                variant="secondary"
                type="button"
                disabled={deletingProject}
                onClick={() => setDeleteProjectTarget(null)}
              >
                取消
              </Button>
              <Button
                variant="danger"
                type="button"
                disabled={deletingProject}
                onClick={() => void confirmDeleteProject()}
              >
                {deletingProject ? "删除中…" : "确认删除"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
