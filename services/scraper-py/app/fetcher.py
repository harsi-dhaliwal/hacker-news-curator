# fetcher.py
import asyncio
import random
import time
from typing import Optional, Tuple, Dict

import httpx

from .config import load_config
from .logging import logger


class RetryableFetch(Exception):
    """Caller should retry with backoff (transient/network/CDN block)."""
    pass


class NonRetryableFetch(Exception):
    """Caller should not retry (definitive failure)."""
    pass


# ----------------------------- HTTP defaults ---------------------------------------

# A small, realistic UA pool (prefer cfg.user_agent if provided)
_UA_POOL = [
    # Chrome (Windows)
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    # Chrome (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Safari (macOS)
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]

_BASE_HEADERS = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}


def _pick_user_agent(cfg) -> str:
    if getattr(cfg, "user_agent", None):
        return cfg.user_agent
    return random.choice(_UA_POOL)


def _http_client(cfg) -> httpx.AsyncClient:
    headers = dict(_BASE_HEADERS)
    headers["User-Agent"] = _pick_user_agent(cfg)

    timeout_s = max(1.0, (getattr(cfg, "fetch_timeout_ms", 10000) or 10000) / 1000.0)

    # Optional proxy support via cfg.http_proxy (e.g., "http://user:pass@host:port")
    proxies = getattr(cfg, "http_proxy", None) or None

    return httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout_s,
        headers=headers,
        http2=True,
        proxies=proxies,
    )


def _classify_status_for_retry(status: int) -> Optional[Exception]:
    """
    Map status codes to Retryable/NonRetryable categories.
    We treat common CDN blocks and rate limits as RETRYABLE to allow
    headless/proxy/backoff to kick in upstream.
    """
    if status >= 500:
        return RetryableFetch(f"status:{status}")
    if status in (401, 403, 406, 408, 409, 412, 429, 451):
        return RetryableFetch(f"status:{status}")
    if status >= 400:
        return NonRetryableFetch(f"status:{status}")
    return None


# ------------------------------- Public API ----------------------------------------

async def fetch_url(url: str) -> Tuple[str, str, bytes, Dict[str, str]]:
    """
    Direct HTTP fetch that looks like a browser (HTTP/2, real headers).
    Returns (final_url, content_type, body, headers).
    Raises RetryableFetch or NonRetryableFetch based on error class.
    """
    cfg = load_config()
    client = _http_client(cfg)

    t0 = time.time()
    logger.info("fetch.start", url=url)
    try:
        resp = await client.get(url)
        status = resp.status_code

        klass = _classify_status_for_retry(status)
        if klass:
            raise klass

        ctype = resp.headers.get("content-type", "") or ""
        body = resp.content
        latency_ms = int((time.time() - t0) * 1000)
        final_url = str(resp.url)

        logger.info(
            "fetch.done",
            url=url,
            final_url=final_url,
            status=status,
            bytes=len(body) if body is not None else 0,
            latency_ms=latency_ms,
            content_type=ctype,
        )
        return final_url, ctype, body, dict(resp.headers)

    except httpx.TimeoutException as e:
        logger.warn("fetch.timeout", url=url)
        raise RetryableFetch("timeout") from e
    except httpx.RequestError as e:
        # DNS reset/refused/TLS/etc
        logger.warn("fetch.request_error", url=url, error=str(e))
        raise RetryableFetch("request_error") from e
    finally:
        await client.aclose()


async def headless_fetch(url: str) -> Optional[Tuple[str, str, bytes, Dict[str, str]]]:
    """
    Rendered fetch using Playwright (Chromium) to bypass JS rendering / simple bot walls.
    Returns (final_url, content_type, body_bytes_utf8, headers) or None if disabled/unavailable.
    """
    cfg = load_config()
    if not getattr(cfg, "headless_enabled", False):
        logger.info("headless.disabled")
        return None

    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception as e:
        logger.warn("headless.not_installed", error=str(e))
        return None

    # Settings with sane fallbacks
    timeout_ms = int(getattr(cfg, "headless_timeout_ms", 15000) or 15000)
    user_agent = _pick_user_agent(cfg)
    viewport = {"width": 1366, "height": 768}
    language = "en-US"
    proxy = getattr(cfg, "headless_proxy", None) or None  # e.g., "http://user:pass@host:port"

    logger.info("headless.start", url=url, timeout_ms=timeout_ms, proxy=bool(proxy))
    t0 = time.time()

    # Helpers to convert playwright response headers -> dict[str, str]
    def _headers_to_dict(h: Dict[str, str]) -> Dict[str, str]:
        # Playwright already provides str->str (case-insensitive internally)
        return dict(h or {})

    async with async_playwright() as p:
        browser = None
        context = None
        page = None
        try:
            launch_args = {
                "headless": True,
                "args": [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                ],
                "timeout": timeout_ms,
            }
            if proxy:
                launch_args["proxy"] = {"server": proxy}

            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(
                user_agent=user_agent,
                locale=language,
                viewport=viewport,
                ignore_https_errors=True,
                java_script_enabled=True,
            )

            # Reduce noise: block heavy resources (images/video) to speed up
            async def _route_handler(route, request):
                rtype = request.resource_type
                if rtype in ("image", "media", "font"):
                    await route.abort()
                else:
                    await route.continue_()

            await context.route("**/*", _route_handler)

            page = await context.new_page()

            # Basic stealth tweaks (not bulletproof, but helps)
            await page.add_init_script(
                """() => {
                    Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                }"""
            )

            # Go!
            resp = await page.goto(
                url,
                wait_until="networkidle",  # wait for network to settle
                timeout=timeout_ms,
            )

            # optional: scroll a bit to trigger lazy content
            try:
                await page.evaluate("""
                    new Promise(res => {
                      let total = 0;
                      const step = () => {
                        window.scrollBy(0, 600);
                        total += 600;
                        if (total >= 2400) return res();
                        setTimeout(step, 250);
                      };
                      step();
                    });
                """)
            except Exception:
                pass

            # Wait a tad after scroll
            try:
                await page.wait_for_timeout(300)
            except Exception:
                pass

            html = await page.content()  # fully rendered HTML
            final_url = page.url
            main_ct = "text/html; charset=utf-8"
            main_headers: Dict[str, str] = {}

            if resp:
                # Try to lift content-type and headers from the main navigation response
                try:
                    main_ct = resp.headers.get("content-type", main_ct) or main_ct
                except Exception:
                    pass
                try:
                    main_headers = _headers_to_dict(resp.headers)
                except Exception:
                    main_headers = {}

            body = html.encode("utf-8", errors="ignore")
            latency_ms = int((time.time() - t0) * 1000)

            logger.info(
                "headless.done",
                url=url,
                final_url=final_url,
                bytes=len(body),
                latency_ms=latency_ms,
                content_type=main_ct,
            )
            return final_url, main_ct, body, main_headers

        except Exception as e:
            logger.warn("headless.error", url=url, error=str(e))
            return None
        finally:
            try:
                if page:
                    await page.close()
            except Exception:
                pass
            try:
                if context:
                    await context.close()
            except Exception:
                pass
            try:
                if browser:
                    await browser.close()
            except Exception:
                pass
