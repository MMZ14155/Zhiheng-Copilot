"""map old project statuses to lifecycle values

Revision ID: 869b3bc05111
Revises: 202609020001
Create Date: 2026-09-02 14:21:32.292718
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '869b3bc05111'
down_revision: str | Sequence[str] | None = '202609020001'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """将旧状态值映射到新的中文生命周期状态。"""
    op.drop_constraint("ck_project_status", "project", type_="check")
    op.execute(sa.text("""
        UPDATE project
        SET status = CASE status
            WHEN 'active' THEN '项目启动'
            WHEN 'completed' THEN '项目结项'
            WHEN 'archived' THEN '项目结项'
            ELSE status
        END
        WHERE status IN ('active', 'completed', 'archived')
    """))
    op.create_check_constraint(
        "ck_project_status",
        "project",
        sa.text("status IN ('项目启动', '合同签署', '已开票', '首款已付', '尾款已付', '全款已付', '项目结项')"),
    )


def downgrade() -> None:
    """恢复旧状态值。"""
    op.drop_constraint("ck_project_status", "project", type_="check")
    op.execute(sa.text("""
        UPDATE project
        SET status = CASE status
            WHEN '项目启动' THEN 'active'
            WHEN '项目结项' THEN 'completed'
            ELSE status
        END
        WHERE status IN ('项目启动', '项目结项')
    """))
    op.create_check_constraint(
        "ck_project_status",
        "project",
        sa.text("status IN ('active', 'archived', 'completed')"),
    )
