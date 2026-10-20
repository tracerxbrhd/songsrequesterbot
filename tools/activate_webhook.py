#!/usr/bin/env python3
"""Safely cut over an existing Telegram bot to Yandex Cloud Functions.

The Bot API token and secret are read from Yandex Lockbox via yc CLI, never
printed and never stored in GitHub repository files.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import requests


def yc(*args: str) -> str:
    result = subprocess.run(["yc", *args], check=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, timeout=35)
    return result.stdout.strip()


def credential(secret_id: str, version_id: str, key: str) -> str:
    value = yc("lockbox", "payload", "get", "--id", secret_id,
               "--version-id", version_id, "--key", key)
    if not value:
        raise RuntimeError("Lockbox entry missing: " + key)
    return value


def cutover(function_id: str, secret_id: str, version_id: str,
            allow_metadata_only: bool = False, *, http=None, secrets_fn=credential, yc_fn=yc):
    transport = http or requests
    data = json.loads(yc_fn("serverless", "function", "get", function_id, "--format", "json"))
    url = data.get("http_invoke_url") or data.get("httpInvokeUrl")
    if not isinstance(url, str) or not url.startswith("https://functions.yandexcloud.net/"):
        raise RuntimeError("Function URL is missing or unexpected. Is the function created?")

    bot_token = secrets_fn(secret_id, version_id, "TELEGRAM_BOT_TOKEN")
    secret = secrets_fn(secret_id, version_id, "TELEGRAM_WEBHOOK_SECRET")
    if len(secret) < 24:
        raise RuntimeError("Invalid webhook secret length")
    header = {"X-Telegram-Bot-Api-Secret-Token": secret}

    # First, call the new function in its own network, without switching
    # Telegram. This test is the important part: 451 from the old runtime may
    # recur here and must be seen before the cutover.
    response = transport.get(url, params={"probe": "1"}, headers=header, timeout=75)
    response.raise_for_status()
    checks = response.json()["checks"]
    for line in checks:
        print(line)  # Only fixed diagnostic codes; the handler never returns secrets.

    for label in ("OAuth:", "Каталог:", "Поиск:"):
        if not any(str(line).startswith(label + " ✅") for line in checks):
            raise RuntimeError(label + " is not ready; webhook left unchanged.")

    audio_ok = any(str(line).startswith("MP3 raw: ✅") for line in checks)
    if not audio_ok and not allow_metadata_only:
        raise RuntimeError("MP3 is not available. Webhook left unchanged. " +
                           "Use --allow-metadata-only only if you accept search-only operation.")

    tg = "https://api.telegram.org/bot" + bot_token + "/"
    response = transport.post(tg + "setWebhook", json={
        "url": url,
        "secret_token": secret,
        "allowed_updates": ["message", "callback_query"],
        "drop_pending_updates": False,
        "max_connections": 1,
    }, timeout=20)
    response.raise_for_status()
    if not response.json().get("ok"):
        raise RuntimeError("Telegram refused to update the webhook")

    response = transport.get(tg + "getWebhookInfo", timeout=15)
    response.raise_for_status()
    info = response.json().get("result", {})
    if info.get("url") != url:
        raise RuntimeError("Telegram did not confirm the new webhook URL")
    print("Cutover confirmed: Telegram now points to Yandex Cloud Functions.")
    print("No tokens or private Lockbox values were printed.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--function-id", required=True)
    parser.add_argument("--secret-id", required=True)
    parser.add_argument("--version-id", required=True)
    parser.add_argument("--allow-metadata-only", action="store_true")
    args = parser.parse_args()
    try:
        cutover(args.function_id, args.secret_id, args.version_id,
                allow_metadata_only=args.allow_metadata_only)
    except (RuntimeError, requests.RequestException, subprocess.CalledProcessError,
            KeyError, ValueError) as exc:
        # Never echo exception texts from yc/Telegram: they might contain credentials.
        print("Cutover aborted. No webhook changes confirmed. Check Lockbox access, " +
              "function status and probe results.", file=sys.stderr)
        sys.exit(1)
