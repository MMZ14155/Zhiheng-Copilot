import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  adminApi,
  errorMessage,
  type AdminUser,
  type ProjectMember,
  type ProjectMemberRole,
} from "../api";
import { Alert, Badge, Button, Empty, Select, Skeleton, Table } from "./ui";

const roleLabels: Record<ProjectMemberRole, string> = {
  manager: "项目负责人",
  implementer: "工作人员",
};

export default function ProjectMembersSection({
  projectId,
}: {
  projectId: number;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] =
    useState<ProjectMemberRole>("implementer");
  const [assigning, setAssigning] = useState(false);
  const [memberActionError, setMemberActionError] = useState<string | null>(
    null,
  );
  const [removingUserId, setRemovingUserId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch((reason: unknown) => {
        console.error("用户列表加载失败", reason);
        if (!cancelled)
          setMemberActionError(
            errorMessage(reason, "用户列表加载失败，请稍后重试"),
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMembers = useCallback(async (pid: number) => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      setMembers(await adminApi.listProjectMembers(pid));
    } catch (reason) {
      console.error("项目成员加载失败", reason);
      setMembersError(errorMessage(reason, "项目成员加载失败，请稍后重试"));
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers(projectId);
  }, [loadMembers, projectId]);

  const assignMember = async (event: FormEvent) => {
    event.preventDefault();
    setMemberActionError(null);
    if (!selectedUserId) {
      setMemberActionError("请选择用户");
      return;
    }
    setAssigning(true);
    try {
      await adminApi.assignMember(projectId, {
        user_id: Number(selectedUserId),
        role: selectedRole,
      });
      setSelectedUserId("");
      await loadMembers(projectId);
    } catch (reason) {
      console.error("项目成员添加失败", reason);
      setMemberActionError(
        errorMessage(reason, "项目成员添加失败，请稍后重试"),
      );
    } finally {
      setAssigning(false);
    }
  };

  const removeMember = async (userId: number) => {
    setRemovingUserId(userId);
    setMemberActionError(null);
    try {
      await adminApi.removeMember(projectId, userId);
      await loadMembers(projectId);
    } catch (reason) {
      console.error("项目成员移除失败", reason);
      setMemberActionError(
        errorMessage(reason, "项目成员移除失败，请稍后重试"),
      );
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <>
      <form
        className="admin-form member-form"
        onSubmit={(event) => void assignMember(event)}
        noValidate
      >
        <label>
          添加用户
          <Select
            aria-label="添加用户"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
          >
            <option value="">请选择用户</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}（{user.login}）
              </option>
            ))}
          </Select>
        </label>
        <label>
          成员角色
          <Select
            aria-label="成员角色"
            value={selectedRole}
            onChange={(event) =>
              setSelectedRole(event.target.value as ProjectMemberRole)
            }
          >
            <option value="manager">项目负责人</option>
            <option value="implementer">工作人员</option>
          </Select>
        </label>
        <Button type="submit" disabled={assigning || users.length === 0}>
          {assigning ? "添加中…" : "添加成员"}
        </Button>
      </form>
      {memberActionError && <Alert>{memberActionError}</Alert>}
      {membersLoading && <Skeleton rows={2} />}
      {!membersLoading && membersError && (
        <Alert
          action={
            <Button
              variant="secondary"
              type="button"
              onClick={() => void loadMembers(projectId)}
            >
              重试
            </Button>
          }
        >
          {membersError}
        </Alert>
      )}
      {!membersLoading &&
        !membersError &&
        (members.length === 0 ? (
          <Empty title="暂无项目成员" description="从上方选择用户并分配角色。" />
        ) : (
          <Table label="项目成员列表">
            <thead>
              <tr>
                <th>姓名</th>
                <th>登录名</th>
                <th>角色</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.name}</td>
                  <td>{member.login}</td>
                  <td>
                    <Badge
                      tone={member.role === "manager" ? "primary" : "neutral"}
                    >
                      {roleLabels[member.role]}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      type="button"
                      disabled={removingUserId === member.userId}
                      onClick={() => void removeMember(member.userId)}
                    >
                      {removingUserId === member.userId ? "移除中…" : "移除"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ))}
    </>
  );
}
