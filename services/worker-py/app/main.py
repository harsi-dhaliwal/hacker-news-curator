"""CLI entrypoint for the worker service (no HTTP server).

Run with: python -m app.main
"""

import asyncio
import signal
import sys

from .worker import run_worker
from .util import setup_logging, get_logger
from .config import load_config


def main() -> int:
    setup_logging()
    log = get_logger()
    cfg = load_config()

    stop_event = asyncio.Event()

    def _handle_sig(signame: str):
        log.info(
            "signal received", extra={"svc": "worker", "signal": signame}
        )
        stop_event.set()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    for s in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(s, _handle_sig, s.name)
        except NotImplementedError:
            # add_signal_handler not supported on some platforms (e.g., Windows)
            pass

    try:
        loop.run_until_complete(run_worker(cfg, stop_event))
        return 0
    except Exception as e:
        log.exception("worker crashed", extra={"svc": "worker"})
        return 1
    finally:
        try:
            loop.run_until_complete(asyncio.sleep(0))
        finally:
            loop.close()


if __name__ == "__main__":
    raise SystemExit(main())
