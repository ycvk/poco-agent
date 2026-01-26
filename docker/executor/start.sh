#!/bin/bash
set -e

echo "=== Poco Executor Container Starting ==="

export DISPLAY=:1

echo "Starting sandbox services (VNC, code-server, Caddy)..."
/usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf &
SUPERVISOR_PID=$!

sleep 3

if ! kill -0 $SUPERVISOR_PID 2>/dev/null; then
    echo "ERROR: Supervisor failed to start"
    exit 1
fi

echo "Sandbox services started successfully"
echo "  - VNC available via noVNC on port 8080"
echo "  - code-server available on port 8080/code/"

echo "Starting Executor API server on port 8000..."
cd /app
exec su ubuntu -c "/app/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000"
