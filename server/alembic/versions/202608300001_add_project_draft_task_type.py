"""add project_draft task type

Revision ID: 202608300001
Revises: 202608280001
Create Date: 2026-08-30 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "202608300001"
down_revision: Union[str, None] = "202608280001"
branch_labels: Union[Sequence[str], Union[Sequence[str], None]] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.drop_constraint("ck_task_type", "task", type_="check")
    op.create_check_constraint(
        "ck_task_type",
        "task",
        "task_type IN ('contract_recognition', 'summary_generation', 'summary_regeneration', 'project_draft')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_task_type", "task", type_="check")
    op.create_check_constraint(
        "ck_task_type",
        "task",
        "task_type IN ('contract_recognition', 'summary_generation', 'summary_regeneration')",
    )
