from sqlalchemy.dialects import postgresql

from app.locking import _stmt_caja_for_update, _stmt_prestamo_for_update


def test_stmt_prestamo_usa_for_update():
    stmt = _stmt_prestamo_for_update("00000000-0000-0000-0000-000000000000")
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql


def test_stmt_caja_usa_for_update():
    stmt = _stmt_caja_for_update("00000000-0000-0000-0000-000000000000")
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE" in sql
