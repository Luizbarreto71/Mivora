#!/usr/bin/env bash
# Development helper: rebuilds the local stack from scratch (all migrations), rebuilds the
# app and runs the Playwright acceptance suite against it. Windows (Git Bash) friendly.
set -u
cd "$(dirname "$0")/../.."
PG_BIN="${PG_BIN:-/c/Users/User/tools/pgsql/bin}"

free_port() {
  local pid
  pid=$(netstat -ano 2>/dev/null | grep ":$1 .*LISTEN" | awk '{print $5}' | head -1)
  if [ -n "$pid" ]; then taskkill //PID "$pid" //F >/dev/null 2>&1 || kill "$pid" 2>/dev/null; fi
}

for port in 3000 54321 54323; do free_port "$port"; done
"$PG_BIN/pg_ctl" -D .local-stack/pgdata -m fast stop >/dev/null 2>&1
for i in $(seq 1 20); do
  netstat -ano 2>/dev/null | grep -qE ":(54321|54322|54323) .*LISTEN" || break
  sleep 1
done

node scripts/local-stack/start.mjs --reset > .local-stack.log 2>&1 &
for i in $(seq 1 60); do
  grep -q "Schema cache loaded in" .local-stack.log 2>/dev/null && break
  sleep 2
done
grep -q "Schema cache loaded in" .local-stack.log || { echo "Local stack did not start"; tail -20 .local-stack.log; exit 1; }

# Never run the acceptance suite against a real project: force the local stack
# (environment variables take precedence over .env.local)
source .local-stack/local.env
case "$NEXT_PUBLIC_SUPABASE_URL" in
  http://localhost:*) ;;
  *) echo "Refusing to run E2E against $NEXT_PUBLIC_SUPABASE_URL"; exit 1 ;;
esac
# Shipping quotes must hit the local test doubles, never Melhor Envio / ViaCEP
case "${MELHOR_ENVIO_BASE_URL:-}" in
  http://localhost:*) ;;
  *) echo "Refusing to run E2E without the local Melhor Envio double"; exit 1 ;;
esac
# Payments must hit the local Mercado Pago double, never the real API
case "${MERCADOPAGO_BASE_URL:-}" in
  http://localhost:*) ;;
  *) echo "Refusing to run E2E without the local Mercado Pago double"; exit 1 ;;
esac
# Same build as Vercel (npm run build uses webpack): Turbopack accepts imports that webpack refuses
npm run build > .next-build.log 2>&1 || { tail -40 .next-build.log; exit 1; }
npx next start -p 3000 > .next-start.log 2>&1 &
for i in $(seq 1 30); do
  curl -s -o /dev/null http://localhost:3000/ && break
  sleep 1
done
npx playwright test "$@"

# The site above now serves local test data. To serve the project configured in .env.local again:
echo "Done. Run: npm run build && npm start  (to serve the site from the project in .env.local again)"
