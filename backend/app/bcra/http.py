from app.bcra.puerto import DeudaBcraNormalizada


class HttpBcraClient:
    """Adaptador HTTP real contra la API de BCRA. Pendiente de integracion (F1+)."""

    async def consultar(self, cuil: str) -> list[DeudaBcraNormalizada]:
        raise NotImplementedError("integracion real BCRA pendiente")
