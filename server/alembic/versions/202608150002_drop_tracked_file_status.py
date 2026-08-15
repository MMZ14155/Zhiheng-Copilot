"""drop tracked file status

Revision ID: 202608150002
Revises: 202608150001
Create Date: 2026-08-15 12:00:00.000000
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "202608150002"
down_revision: str | Sequence[str] | None = "202608150001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_tracked_file_status", "tracked_file", type_="check")
    op.drop_column("tracked_file", "status")


def downgrade() -> None:
    op.add_column(
        "tracked_file",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="missing",
        ),
    )
    op.create_check_constraint(
        "ck_tracked_file_status",
        "tracked_file",
        "status IN ('ok', 'missing', 'old', 'conflict', 'frozen')",
    )
