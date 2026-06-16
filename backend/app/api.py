from fastapi import APIRouter

from app.bcra.router import router_bcra
from app.bcra.router import router_personas as bcra_personas_router
from app.jobs.router import router as jobs_router
from app.m01_personas.router import router as m01_router
from app.m02_originacion.router import router as m02_router
from app.m03_prestamos.router import router as m03_router
from app.m04_caja.router import router as m04_caja_router
from app.m04_pagos.router import router as m04_pagos_router
from app.m05_ruta.router import router as m05_router
from app.m06_novaciones.router import router as m06_router
from app.m07_riesgo.router import router as m07_router
from app.m08_crm.router import router as m08_router
from app.m09_comisiones.metas_router import router as m09_metas_router
from app.m09_comisiones.router import router as m09_router
from app.m10_tesoreria.router import router as m10_router
from app.m11_torre.router import router as m11_router
from app.m12_auth.router import router as m12_router
from app.m13_documentos.router import router as m13_router
from app.m14_analytics.router import router as m14_router
from app.m15_catalogo.router import router as m15_router
from app.m16_maestros.router import router as m16_router
from app.workflows.router import router as workflows_router

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(m12_router)
api_v1.include_router(m01_router)
api_v1.include_router(bcra_personas_router)
api_v1.include_router(router_bcra)
api_v1.include_router(m15_router)
api_v1.include_router(m16_router)
api_v1.include_router(m02_router)
api_v1.include_router(m03_router)
api_v1.include_router(m04_caja_router)
api_v1.include_router(m04_pagos_router)
api_v1.include_router(m05_router)
api_v1.include_router(m06_router)
api_v1.include_router(m07_router)
api_v1.include_router(m08_router)
api_v1.include_router(m09_router)
api_v1.include_router(m09_metas_router)
api_v1.include_router(m10_router)
api_v1.include_router(m11_router)
api_v1.include_router(m14_router)
api_v1.include_router(workflows_router)
api_v1.include_router(m13_router)
api_v1.include_router(jobs_router)
