"""fix freeze guard trigger to return NEW on UPDATE"""

from collections.abc import Sequence

from alembic import op

revision: str = "202608100002"
down_revision: str | Sequence[str] | None = "202608100001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_frozen_file_version_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF OLD.is_frozen THEN
            RAISE EXCEPTION 'frozen file_version % cannot be modified or deleted', OLD.version
              USING ERRCODE = 'check_violation';
          END IF;
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END;
        $$
        """
    )


def downgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_frozen_file_version_change()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          IF OLD.is_frozen THEN
            RAISE EXCEPTION 'frozen file_version % cannot be modified or deleted', OLD.version
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN OLD;
        END;
        $$
        """
    )
