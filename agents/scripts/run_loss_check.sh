#!/bin/bash
# Wrapper so cron (which doesn't run from this directory) can invoke
# check_for_losses.py with the right working directory and PYTHONPATH.
cd "$(dirname "$0")/.." || exit 1
PYTHONPATH=. venv/bin/python scripts/check_for_losses.py
