"""add project type

Revision ID: 202608160001
Revises: 202608150003
"""

import sqlalchemy as sa
from alembic import op


revision = "202608160001"
down_revision = "202608150003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project", sa.Column("project_type", sa.String(20), nullable=True))
    op.create_check_constraint(
        "ck_project_type",
        "project",
        "project_type IN ('软件销售', '正版化服务', '正版化服务+软件销售')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_project_type", "project", type_="check")
    op.drop_column("project", "project_type")
