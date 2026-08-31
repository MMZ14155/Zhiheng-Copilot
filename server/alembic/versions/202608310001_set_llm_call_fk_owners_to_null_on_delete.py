"""set llm_call fk owners to null on delete

llm_call 的外键对 task、file_version、summary、project 使用 RESTRICT，导致
删除任务/摘要/版本/项目时只要存在调用日志就会违反外键约束。改为 SET NULL，
让审计日志在归属对象删除后仍然保留，所有者可空且已被允许。

Revision ID: 202608310001
Revises: 202608300002
Create Date: 2026-08-31 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "202608310001"
down_revision: str | Sequence[str] | None = "202608300002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FKS: list[tuple[str, str, str, str]] = [
    ("llm_call_task_id_fkey", "task_id", "task", "id"),
    ("llm_call_file_version_fkey", "file_version", "file_version", "version"),
    ("llm_call_summary_id_fkey", "summary_id", "summary", "id"),
    ("llm_call_project_id_fkey", "project_id", "project", "id"),
]


def upgrade() -> None:
    for name, column, ref_table, ref_column in _FKS:
        op.drop_constraint(name, "llm_call", type_="foreignkey")
        op.create_foreign_key(
            name,
            "llm_call",
            ref_table,
            [column],
            [ref_column],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    for name, column, ref_table, ref_column in reversed(_FKS):
        op.drop_constraint(name, "llm_call", type_="foreignkey")
        op.create_foreign_key(
            name,
            "llm_call",
            ref_table,
            [column],
            [ref_column],
            ondelete="RESTRICT",
        )
