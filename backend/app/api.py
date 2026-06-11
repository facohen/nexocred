from fastapi import APIRouter

from app.m12_auth.router import router as m12_router

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(m12_router)
