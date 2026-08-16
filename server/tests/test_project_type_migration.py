import importlib.util
from pathlib import Path
from unittest.mock import patch


def test_project_type_migration_upgrade_and_downgrade():
    path = Path(__file__).parents[1] / "alembic" / "versions" / "202608160001_project_type.py"
    spec = importlib.util.spec_from_file_location("project_type_migration", path)
    assert spec and spec.loader
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    with patch.object(migration.op, "add_column") as add_column, patch.object(
        migration.op, "create_check_constraint"
    ) as create_constraint:
        migration.upgrade()
    column = add_column.call_args.args[1]
    assert column.name == "project_type" and column.nullable is True
    create_constraint.assert_called_once()

    with patch.object(migration.op, "drop_constraint") as drop_constraint, patch.object(
        migration.op, "drop_column"
    ) as drop_column:
        migration.downgrade()
    drop_constraint.assert_called_once_with("ck_project_type", "project", type_="check")
    drop_column.assert_called_once_with("project", "project_type")
