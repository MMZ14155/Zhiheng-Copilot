"""relax llm_call owner constraint for project_draft

建项草稿（project_draft）与 copilot 问答一样没有单一归属对象，原约束要求非
copilot_answer 场景必须恰好一个 owner，导致建项草稿的 LLM 调用记录写入失败。

Revision ID: 202608280001
Revises: 202608260001
Create Date: 2026-08-28 00:00:00.000000
"""
from collections.abc import Sequence

from alembic import op

revision: str = "202608280001"
down_revision: str | Sequence[str] | None = "202608260001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW = (
    "(scene IN ('copilot_answer', 'project_draft') AND num_nonnulls(task_id, file_version, summary_id, project_id) <= 1) "
    "OR (scene NOT IN ('copilot_answer', 'project_draft') AND num_nonnulls(task_id, file_version, summary_id, project_id) = 1)"
)
_OLD = (
    "(scene = 'copilot_answer' AND num_nonnulls(task_id, file_version, summary_id, project_id) <= 1) "
    "OR (scene <> 'copilot_answer' AND num_nonnulls(task_id, file_version, summary_id, project_id) = 1)"
)


def upgrade() -> None:
    op.drop_constraint("ck_llm_call_single_owner", "llm_call", type_="check")
    op.create_check_constraint("ck_llm_call_single_owner", "llm_call", _NEW)


def downgrade() -> None:
    op.drop_constraint("ck_llm_call_single_owner", "llm_call", type_="check")
    op.create_check_constraint("ck_llm_call_single_owner", "llm_call", _OLD)
