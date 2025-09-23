#!/usr/bin/env bash
set -euo pipefail

# ---------- CONFIG ----------
HOST_ALIAS="bluehost"  # defined in ~/.ssh/config
REMOTE_APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
REMOTE_FRONTEND_DIR="/home4/fbwkscom/public_html/fmsubapp"
API_URL="https://fmsub.fbwks.com/api"
# ----------------------------

echo "==> Building frontend with VITE_API_URL=${API_URL}"
pushd web >/dev/null
printf "VITE_API_URL=%s\n" "$API_URL" > .env.production
# Use npm ci when your node_modules is clean & lockfile present.
# npm ci || npm install
npm install
npm run build
popd >/dev/null

echo "==> Uploading frontend to $HOST_ALIAS:$REMOTE_FRONTEND_DIR"
rsync -az --delete web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"

echo "==> Syncing backend source to $HOST_ALIAS:$REMOTE_APP_DIR"
RSYNC_EXCLUDES=(
  ".git/"
  "vendor/"
  "node_modules/"
  "storage/"
  ".env"
  "web/"
)
RSYNC_ARGS=()
for e in "${RSYNC_EXCLUDES[@]}"; do RSYNC_ARGS+=(--exclude "$e"); done
rsync -az --delete "${RSYNC_ARGS[@]}" ./ "$HOST_ALIAS:$REMOTE_APP_DIR/"

echo "==> Running server-side Composer/Artisan"
ssh -T "$HOST_ALIAS" bash <<'EOF'
  set -euo pipefail
  APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
  cd "$APP_DIR"

  # Ensure composer resolves correctly in non-login shells
  if ! command -v composer >/dev/null; then
    alias composer="/usr/local/bin/php $HOME/bin/composer"
  fi

composer install --no-dev --optimize-autoloader

# Make sure cache/compiled views/routes are fresh and reflect new code + env
php artisan optimize:clear
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

mkdir -p storage bootstrap/cache
chmod -R a+rw storage bootstrap/cache

echo "==> Health checks"
curl -sfI "https://fmsub.fbwks.com/api/ping" | head -n 1
curl -sfI -X OPTIONS "https://fmsub.fbwks.com/api/auth/login" \
  -H "Origin: https://fmsubapp.fbwks.com" \
  -H "Access-Control-Request-Method: POST" | grep -i "Access-Control-Allow-Origin" || true
  

  echo "Server deploy complete."
EOF

echo "==> Done. Frontend: https://fmsubapp.fbwks.com | API: https://fmsub.fbwks.com/api/ping"
