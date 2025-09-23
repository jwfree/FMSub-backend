#!/usr/bin/env bash
set -euo pipefail

# ---------- CONFIG ----------
HOST_ALIAS="bluehost"  # defined in ~/.ssh/config
REMOTE_APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
REMOTE_FRONTEND_DIR="/home4/fbwkscom/public_html/fmsubapp"
API_URL="https://fmsub.fbwks.com/api"
FRONTEND_URL="https://fmsubapp.fbwks.com"   # used for sanity check + .htaccess
# ----------------------------

echo "==> Building frontend with VITE_API_URL=${API_URL}"
pushd web >/dev/null
printf "VITE_API_URL=%s\n" "$API_URL" > .env.production
# If you later wire this in vite.config.ts you can also do:
# printf "VITE_BASE=%s\n" "/fmsubapp/" >> .env.production

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run build
popd >/dev/null

echo "==> Uploading frontend dist to $HOST_ALIAS:$REMOTE_FRONTEND_DIR"
# Deploy built assets; keep any pre-existing .htaccess intact
rsync -az --delete --exclude ".htaccess" web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"

echo "==> Overlaying static public/ (favicons, robots.txt, optional .htaccess)"
# This does NOT use --delete, so it won't remove pre-existing files
rsync -az web/public/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"

echo "==> Ensuring SPA .htaccess exists on remote (safety net)"
ssh -T "$HOST_ALIAS" bash <<'EOF_HTACCESS'
set -euo pipefail
FRONT_DIR="/home4/fbwkscom/public_html/fmsubapp"
mkdir -p "$FRONT_DIR"
# Only create if missing; won't overwrite if you ship one from web/public/.htaccess
if [ ! -f "$FRONT_DIR/.htaccess" ]; then
  cat > "$FRONT_DIR/.htaccess" <<'HTA'
# SPA router: send unknown paths to index.html (but keep existing assets/API)
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /fmsubapp/
  # Don’t rewrite existing files or directories
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Keep API requests intact
  RewriteCond %{REQUEST_URI} !^/api/
  RewriteRule . /fmsubapp/index.html [L]
</IfModule>
HTA
fi
EOF_HTACCESS

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

  echo "==> Composer install"
  composer install --no-dev --optimize-autoloader

  echo "==> Clear caches (handles route/config/view)"
  php artisan optimize:clear || true

  echo "==> Migrate"
  php artisan migrate --force

  echo "==> Storage symlink (for vendor banner/photo)"
  php artisan storage:link || true
  mkdir -p storage bootstrap/cache
  chmod -R a+rw storage bootstrap/cache

  echo "==> Rebuild caches"
  php artisan config:cache
  php artisan route:cache
  php artisan view:cache

  echo "==> Sanity: APP_FRONTEND_URL"
  FRONT_URL=$(php -r 'echo $_ENV["APP_FRONTEND_URL"] ?? getenv("APP_FRONTEND_URL") ?? "";')
  if [ -z "$FRONT_URL" ]; then
    echo "WARNING: APP_FRONTEND_URL is empty. QR links may be wrong."
  else
    echo "APP_FRONTEND_URL=$FRONT_URL"
  fi

  echo "==> Health checks"
  curl -sfI "https://fmsub.fbwks.com/api/ping" | head -n 1
  # CORS preflight
  curl -sfI -X OPTIONS "https://fmsub.fbwks.com/api/auth/login" \
    -H "Origin: https://fmsubapp.fbwks.com" \
    -H "Access-Control-Request-Method: POST" | grep -i "Access-Control-Allow-Origin" || true
  # QR / flyer endpoints (HEAD)
  curl -sfI "https://fmsub.fbwks.com/api/vendors/1/qr.png" | head -n 1 || true
  curl -sfI "https://fmsub.fbwks.com/api/vendors/1/flyer.pdf" | head -n 1 || true

  echo "Server deploy complete."
EOF

echo "==> Done. Frontend: ${FRONTEND_URL} | API: ${API_URL}/ping"
