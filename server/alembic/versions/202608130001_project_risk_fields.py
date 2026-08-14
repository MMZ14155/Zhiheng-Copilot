"""add project risk fields

Revision ID: 202608130001
Revises: 202608110001
Create Date: 2026-08-13 09:00:00.000000
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "202608130001"
down_revision: str | Sequence[str] | None = "202608110001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("project", sa.Column("stage", sa.String(20), nullable=True))
    op.add_column("project", sa.Column("budget", sa.Numeric(18, 2), nullable=True))
    op.add_column("project", sa.Column("cost", sa.Numeric(18, 2), nullable=True))
    op.add_column("project", sa.Column("planned_days", sa.Integer(), nullable=True))
    op.add_column("project", sa.Column("used_days", sa.Integer(), nullable=True))
    op.add_column("project", sa.Column("quality_issues", sa.Integer(), nullable=True))
    op.add_column("project", sa.Column("satisfaction", sa.Numeric(3, 2), nullable=True))
    op.add_column("project", sa.Column("acceptance_result", sa.String(20), nullable=True))
    op.add_column("project", sa.Column("risk_config", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    for column in (
        "risk_config", "acceptance_result", "satisfaction", "quality_issues",
        "used_days", "planned_days", "cost", "budget", "stage",
    ):
        op.drop_column("project", column)
