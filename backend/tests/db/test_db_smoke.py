import pytest
from sqlalchemy import text

from app.db import async_session_maker


@pytest.mark.asyncio
async def test_puede_conectar_a_postgres():
    async with async_session_maker() as session:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar() == 1
