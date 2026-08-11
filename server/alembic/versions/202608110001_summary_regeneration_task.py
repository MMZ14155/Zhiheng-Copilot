"""allow summary regeneration task type

Revision ID: 202608110001
Revises: 202608100003
Create Date: 2026-08-11 02:00:00.000000
"""
from collections.abc import Sequence

from alembic import op


revision: str = "202608110001"
down_revision: str | Sequence[str] | None = "202608100003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_task_type", "task", type_="check")
    op.create_check_constraint(
        "ck_task_type",
        "task",
        "task_type IN ('contract_recognition', 'summary_generation', 'summary_regeneration')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_task_type", "task", type_="check")
    op.create_check_constraint(
        "ck_task_type",
        "task",
        "task_type IN ('contract_recognition', 'summary_generation')",
    )
