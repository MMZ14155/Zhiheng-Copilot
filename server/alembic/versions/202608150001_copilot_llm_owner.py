"""allow project or ownerless copilot llm calls

Revision ID: 202608150001
Revises: 202608140001
"""

import sqlalchemy as sa
from alembic import op


revision = "202608150001"
down_revision = "202608140001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("llm_call", sa.Column("project_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_llm_call_project_id",
        "llm_call",
        "project",
        ["project_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.drop_constraint("ck_llm_call_single_owner", "llm_call", type_="check")
    op.create_check_constraint(
        "ck_llm_call_single_owner",
        "llm_call",
        "(scene = 'copilot_answer' AND num_nonnulls(task_id, file_version, summary_id, project_id) <= 1) "
        "OR (scene <> 'copilot_answer' AND num_nonnulls(task_id, file_version, summary_id, project_id) = 1)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_llm_call_single_owner", "llm_call", type_="check")
    op.create_check_constraint(
        "ck_llm_call_single_owner",
        "llm_call",
        "num_nonnulls(task_id, file_version, summary_id) = 1",
    )
    op.drop_constraint("fk_llm_call_project_id", "llm_call", type_="foreignkey")
    op.drop_column("llm_call", "project_id")
