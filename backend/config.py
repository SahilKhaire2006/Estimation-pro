from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")

    environment: str = "development"

    supabase_url: str
    supabase_key: str  # anon
    supabase_service_key: str | None = None

    groq_api_key: str
    groq_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"

    upstash_redis_rest_url: str | None = None
    upstash_redis_rest_token: str | None = None
    redis_host: str | None = None
    redis_port: int | None = None
    redis_password: str | None = None

    use_memory_queue: bool = True

    api_base_path: str = "/api"


def get_settings() -> Settings:
    return Settings()

