from fastapi import APIRouter

from app.bcra.router import router_bcra, router_personas as bcra_personas_router
from app.m01_personas.router import router as m01_router
from app.m12_auth.router import router as m12_router

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(m12_router)
api_v1.include_router(m01_router)
api_v1.include_router(bcra_personas_router)
api_v1.include_router(router_bcra)
