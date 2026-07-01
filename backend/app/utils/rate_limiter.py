from collections import defaultdict, deque
from threading import Lock
import time

from fastapi import HTTPException, Request


class SlidingWindowRateLimiter:
    def __init__(self, clock=None):
        self._clock = clock or time.monotonic
        self._requests = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> int:
        now = self._clock()
        cutoff = now - window_seconds

        with self._lock:
            timestamps = self._requests[key]
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if len(timestamps) >= limit:
                retry_after = max(1, int(timestamps[0] + window_seconds - now) + 1)
                return retry_after

            timestamps.append(now)

        return 0

    def reset(self):
        with self._lock:
            self._requests.clear()


limiter = SlidingWindowRateLimiter()


def get_client_identifier(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown-client"


def enforce_rate_limit(
    request: Request,
    scope: str,
    limit: int,
    window_seconds: int,
    identity: str = "",
):
    client = get_client_identifier(request)
    normalized_identity = identity.strip().lower()
    key = f"{scope}:{client}:{normalized_identity}"
    retry_after = limiter.check(key, limit, window_seconds)

    if retry_after:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )
