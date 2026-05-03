from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx
from rich.console import Console

from config import get_settings

console = Console()


@dataclass
class CacheItem:
    value: Any
    expires_at: float


class MemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, CacheItem] = {}

    def get(self, key: str) -> Any | None:
        item = self._store.get(key)
        if not item:
            return None
        if item.expires_at <= time.time():
            self._store.pop(key, None)
            return None
        return item.value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._store[key] = CacheItem(value=value, expires_at=time.time() + ttl_seconds)


class UpstashRedisRest:
    def __init__(self, rest_url: str, rest_token: str) -> None:
        self.rest_url = rest_url.rstrip("/")
        self.rest_token = rest_token

    async def get(self, key: str) -> Any | None:
        url = f"{self.rest_url}/get/{key}"
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return data.get("result")

    async def setex(self, key: str, ttl_seconds: int, value: str) -> bool:
        url = f"{self.rest_url}/set/{key}/{value}?EX={ttl_seconds}"
        headers = {"Authorization": f"Bearer {self.rest_token}"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, headers=headers)
        return resp.status_code == 200


class RedisClient:
    def __init__(self) -> None:
        s = get_settings()
        self._memory = MemoryCache()
        self._upstash = None
        if s.upstash_redis_rest_url and s.upstash_redis_rest_token:
            self._upstash = UpstashRedisRest(
                rest_url=s.upstash_redis_rest_url,
                rest_token=s.upstash_redis_rest_token,
            )

    async def get_json(self, key: str) -> Any | None:
        if self._upstash:
            return await self._upstash.get(key)
        return self._memory.get(key)

    async def set_json(self, key: str, value: str, ttl_seconds: int) -> None:
        if self._upstash:
            await self._upstash.setex(key, ttl_seconds, value)
            return
        self._memory.set(key, value, ttl_seconds)

