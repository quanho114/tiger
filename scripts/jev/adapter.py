"""Bounded Jev adapter. No trace, page text, credentials, or generated text emitted."""
import json
import os
from pathlib import Path
import re
import runpy
import sys
import time
from urllib.parse import urlsplit


def deny_secrets(event, args):
    if event == "open" and isinstance(args[0], (str, bytes)):
        name = Path(os.fsdecode(args[0])).name
        if name == ".env" or name.startswith(".env.") or name in {"auth.json", "credentials.json"}:
            raise PermissionError("Secret file access denied")


sys.addaudithook(deny_secrets)

stage = "setup"


def diagnostic(error, current_stage):
    reason = {"agent_init": "BROWSER_ERROR", "predict": "BROWSER_ERROR",
              "action": "ACTION_ERROR", "assertions": "ASSERTIONS_ERROR",
              "cleanup": "CLEANUP_ERROR"}.get(current_stage, "ADAPTER_ERROR")
    result = {"status": "error", "stage": current_stage, "reason": reason}
    # Match only complete upstream-owned messages; never emit exception text.
    message = str(error)
    if current_stage in {"predict", "action"}:
        status = re.fullmatch(r"Model provider returned HTTP ([45][0-9]{2}); no action executed\.", message)
        if status:
            result.update(reason="MODEL_HTTP_ERROR", http_status=int(status[1]))
        elif message == "Model connection failed; no action executed.":
            result["reason"] = "MODEL_CONNECTION_ERROR"
        elif isinstance(error, json.JSONDecodeError) or message in {
            "Invalid TypeSafe response; no action executed.",
            "Text helper returned no valid field value; nothing typed.",
        }:
            result["reason"] = "MODEL_INVALID_RESPONSE"
    return result


def supported():
    # Locate without importing admin: admin has an import-time .env loader.
    import importlib.util
    spec = importlib.util.find_spec("browser_harness")
    base = Path(next(iter(spec.submodule_search_locations)))
    return ('os.environ.get("BU_CDP_WS")' in (base / "daemon.py").read_text()
            and 'os.environ.get("BU_NAME"' in (base / "helpers.py").read_text()
            and 'BH_RUNTIME_DIR' in (base / "_ipc.py").read_text()
            and 'def _sock_path(name)' in (base / "_ipc.py").read_text())


def main():
    global stage
    if sys.argv[1:] == ["--check"]:
        print(json.dumps({"supported": supported()}))
        return
    if not re.fullmatch(r"jev-[a-f0-9]{24}", os.environ.get("BU_NAME", "")):
        raise ValueError("Invalid owned harness")
    if not re.fullmatch(r"ws://127\.0\.0\.1:\d+/devtools/browser/[a-zA-Z0-9-]+", os.environ.get("BU_CDP_WS", "")):
        raise ValueError("Invalid owned browser")
    # Harness resolves BH_RUNTIME_DIR, so a proc alias there alone is ineffective.
    # Keep its private runtime/log layout; shorten only the AF_UNIX address.
    alias = os.environ.get("JEV_RUNTIME_ALIAS")
    if alias:
        if not re.fullmatch(r"/proc/[0-9]+/fd/[0-9]+", alias):
            raise ValueError("Invalid runtime alias")
        runtime = Path(os.environ["BH_RUNTIME_DIR"])
        if not Path(alias).samefile(runtime):
            raise ValueError("Runtime alias mismatch")
        from browser_harness import _ipc
        _ipc._sock_path = lambda name: Path(alias) / f"{_ipc._runtime_stem(name)}.sock"
    if sys.argv[1:] == ["--ping"]:
        from browser_harness import _ipc
        print(json.dumps({"ready": bool(_ipc.ping(os.environ["BU_NAME"], timeout=0.2))}))
        return
    if sys.argv[1:] == ["--daemon"]:
        runpy.run_module("browser_harness.daemon", run_name="__main__")
        return
    url = os.environ["JEV_URL"]
    parsed = urlsplit(url)
    if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port or parsed.path != "/menu" or parsed.query or parsed.fragment or parsed.username:
        raise ValueError("Invalid fixture URL")
    from browser_harness import admin, _ipc
    def owned_daemon_only():
        if not _ipc.ping(os.environ["BU_NAME"], timeout=1):
            raise RuntimeError("Owned daemon unavailable")
    admin.ensure_daemon = owned_daemon_only
    from jev_ultrafast import Agent
    import jev_ultrafast.browser as browser_module
    from jev_ultrafast.browser import StalePage
    context_id = os.environ.get("JEV_CONTEXT_ID", "")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", context_id):
        raise ValueError("Missing guarded browser context")
    original_cdp = browser_module.cdp
    def guarded_cdp(method, **params):
        if method == "Target.createTarget":
            params["browserContextId"] = context_id
        return original_cdp(method, **params)
    browser_module.cdp = guarded_cdp
    agent = None
    try:
        stage = "agent_init"
        agent = Agent(url, "Switch the menu to Giao tận nơi (delivery) and stop when the Bò tơ nướng tảng sốt tiêu dish is visible. Do not add to cart, order, sign in, reserve, or leave this website.")
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            settled = agent.browser.evaluate("""(() => {
                const beef = document.querySelector('article[data-dish-id="jev-beef"]');
                return !!(beef && beef.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
            })()""")
            if settled:
                break
            time.sleep(0.05)
        agent.state["page"] = agent.browser.observe(screenshot=agent.screenshots)
        for _ in range(12):
            stage = "predict"
            agent.command("predict")
            stage = "action"
            try:
                agent.command("act", {"fingerprint": agent.state["page"]["fingerprint"]})
            except StalePage:
                agent.state["decision"] = None
                agent.state["status"] = "ready"
                agent.state["page"] = agent.browser.observe(screenshot=agent.screenshots)
                continue
            if agent.state["status"] in {"done", "blocked"}:
                break
        assertions = agent.browser.evaluate("""(() => {
          const e = document.querySelector('article[data-dish-id="jev-beef"]');
          const r = e?.getBoundingClientRect();
          return {menu: !!(e && r.width && r.height && r.top < innerHeight && r.bottom > 0 && e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})),
            delivery: location.pathname === '/menu' && new URLSearchParams(location.search).get('mode') === 'delivery'};
        })()""")
        result = {"status": agent.state["status"], "actions": len(agent.state["history"]),
                  "decisions": len(agent.state["decisions"]), "text_calls": len(agent.state["text_calls"]),
                  "assertions": assertions}
    finally:
        if agent:
            # Preserve the original failure if closing the browser also fails.
            failing = sys.exc_info()[0] is not None
            try:
                agent.browser.close()
            except Exception:
                if not failing:
                    stage = "cleanup"
                    raise
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps(diagnostic(error, stage)))
        sys.exit(1)
