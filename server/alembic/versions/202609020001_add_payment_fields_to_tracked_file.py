"""add payment fields to tracked_file

Revision ID: 202609020001
Revises: 202609010001
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "202609020001"
down_revision: Union[str, None] = "202609010001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tracked_file", sa.Column("payment_status", sa.String(length=20), nullable=True))
    op.add_column("tracked_file", sa.Column("receivable_amount", sa.Numeric(precision=18, scale=2), nullable=True))
    op.add_column("tracked_file", sa.Column("received_amount", sa.Numeric(precision=18, scale=2), nullable=True))
    op.add_column("tracked_file", sa.Column("payment_date", sa.Date(), nullable=True))
    op.add_column("tracked_file", sa.Column("remarks", sa.Text(), nullable=True))

    op.drop_constraint("ck_tracked_file_category", "tracked_file", type_="check")
    op.create_check_constraint(
        "ck_tracked_file_category",
        "tracked_file",
        sa.sql.column("category").in_(["合同", "成本明细", "验收材料", "检测报告", "交付成果", "回款"]),
    )


def downgrade() -> None:
    op.drop_constraint("ck_tracked_file_category", "tracked_file", type_="check")
    op.create_check_constraint(
        "ck_tracked_file_category",
        "tracked_file",
        sa.sql.column("category").in_(["合同", "成本明细", "验收材料", "检测报告", "交付成果"]),
    )

    op.drop_column("tracked_file", "remarks")
    op.drop_column("tracked_file", "payment_date")
    op.drop_column("tracked_file", "received_amount")
    op.drop_column("tracked_file", "receivable_amount")
    op.drop_column("tracked_file", "payment_status")
