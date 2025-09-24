#!/usr/bin/env bash
set -euo pipefail

# ---------------- CONFIG ----------------
HOST_ALIAS="bluehost"  # must exist in ~/.ssh/config
REMOTE_APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
REMOTE_FRONTEND_DIR="/home4/fbwkscom/public_html/fmsubapp"
API_URL="https://fmsub.fbwks.com/api"
FRONTEND_URL="https://fmsubapp.fbwks.com"
# ----------------------------------------

echo "==> Building frontend with VITE_API_URL=${API_URL}"
pushd web >/dev/null
printf "VITE_API_URL=%s\n" "$API_URL" > .env.production
npm install
npm run build
popd >/dev/null

echo "==> Removing any web/dist/.htaccess (we deploy our own)"
rm -f web/dist/.htaccess || true

echo "==> Uploading frontend to $HOST_ALIAS:$REMOTE_FRONTEND_DIR (excluding any .htaccess)"
# we explicitly exclude .htaccess from dist just in case
rsync -az --delete --exclude='.htaccess' web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"

echo "==> Ensuring SPA .htaccess exists on remote (no RewriteBase)"
ssh -T "$HOST_ALIAS" bash <<'EOF_HTACCESS'
set -euo pipefail
FRONT_DIR="/home4/fbwkscom/public_html/fmsubapp"
mkdir -p "$FRONT_DIR"
cat > "$FRONT_DIR/.htaccess" <<'HTA'
# React/Vite SPA router: send unknown paths to index.html
<IfModule mod_rewrite.c>
  RewriteEngine On

  # Serve existing files/dirs as-is
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Don't rewrite built assets or common static files
  RewriteRule ^(assets/|favicon\.ico|robots\.txt|manifest\.webmanifest) - [L]

  # Everything else -> index.html (relative path, no RewriteBase)
  RewriteRule ^ index.html [L]
</IfModule>
HTA

echo "---- .htaccess head ----"
head -n 20 "$FRONT_DIR/.htaccess" || true
echo "------------------------"
EOF_HTACCESS

echo "==> Syncing backend source to $HOST_ALIAS:$REMOTE_APP_DIR"
# IMPORTANT: exclude public/storage to avoid uploading a local symlink
RSYNC_EXCLUDES=(
  ".git/"
  "vendor/"
  "node_modules/"
  "storage/"
  ".env"
  "web/"
  "public/storage"    # <-- never upload local storage link/dir
)
RSYNC_ARGS=()
for e in "${RSYNC_EXCLUDES[@]}"; do RSYNC_ARGS+=(--exclude "$e"); done
rsync -az --delete "${RSYNC_ARGS[@]}" ./ "$HOST_ALIAS:$REMOTE_APP_DIR/"

echo "==> Running server-side Composer/Artisan"
ssh -T "$HOST_ALIAS" bash <<'EOF'
  set -euo pipefail
  APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
  cd "$APP_DIR"

  # Ensure composer is callable
  if ! command -v composer >/dev/null 2>&1; then
    alias composer="/usr/local/bin/php $HOME/bin/composer"
  fi

  echo "==> Remove stale Laravel caches (avoid leaking local paths)"
  rm -f bootstrap/cache/config.php \
        bootstrap/cache/packages.php \
        bootstrap/cache/services.php \
        bootstrap/cache/routes-*.php || true

  echo "==> Ensure storage/cache dirs exist & are writable"
  mkdir -p storage/logs storage/framework/{cache,sessions,views} bootstrap/cache
  chmod -R 775 storage bootstrap/cache || true

  echo "==> Fix/refresh storage symlink"
  # Nuke any wrong link or leftover and recreate
  if [ -L public/storage ] || [ -d public/storage ] || [ -e public/storage ]; then
    rm -rf public/storage
  fi
  php artisan storage:link || true

  echo "==> Composer install"
  composer install --no-dev --optimize-autoloader

  echo "==> Clear caches (to be safe)"
  LOG_CHANNEL=stderr php artisan optimize:clear || true

  echo "==> Run migrations"
  php artisan migrate --force

  echo "==> Rebuild caches"
  LOG_CHANNEL=stderr php artisan config:cache
  LOG_CHANNEL=stderr php artisan route:cache
  php artisan view:cache

  echo "==> Sanity: environment values seen by PHP"
  php -r 'echo "APP_URL=".($_ENV["APP_URL"]??getenv("APP_URL")??"").PHP_EOL;'
  php -r 'echo "APP_FRONTEND_URL=".($_ENV["APP_FRONTEND_URL"]??getenv("APP_FRONTEND_URL")??"").PHP_EOL;'

  echo "==> Health checks (API)"
  curl -sfI "https://fmsub.fbwks.com/api/ping" | head -n 1 || true
  curl -sfI -X OPTIONS "https://fmsub.fbwks.com/api/auth/login" \
    -H "Origin: https://fmsubapp.fbwks.com" \
    -H "Access-Control-Request-Method: POST" | grep -i "Access-Control-Allow-Origin" || true
  curl -sfI "https://fmsub.fbwks.com/api/vendors/1/qr.png" | head -n 1 || true
  curl -sfI "https://fmsub.fbwks.com/api/vendors/1/flyer.pdf" | head -n 1 || true

  echo "==> Health checks (SPA)"
  curl -sfI "https://fmsubapp.fbwks.com/fmsubapp/" | head -n 1 || true
  curl -sfI "https://fmsubapp.fbwks.com/fmsubapp/index.html" | head -n 1 || true

  echo "Server deploy complete."
EOF

echo "==> Done. Frontend: ${FRONTEND_URL} | API: ${API_URL}/ping"
