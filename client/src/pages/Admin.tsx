import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, errorMessage, type AdminUser } from "../api";
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

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setUsers(await adminApi.listUsers());
    } catch (reason) {
      console.error("管理数据加载失败", reason);
      setLoadError(errorMessage(reason, "管理数据加载失败，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

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
          onClick={() => void loadOverview()}
          disabled={loading}
        >
          {loading ? "加载中…" : "刷新数据"}
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
              onClick={() => void loadOverview()}
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
    </div>
  );
}
