#!/usr/bin/env bash
set -euo pipefail

# ---------- CONFIG ----------
HOST_ALIAS="bluehost"  # defined in ~/.ssh/config
REMOTE_APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
REMOTE_FRONTEND_DIR="/home4/fbwkscom/public_html/fmsubapp"
API_URL="https://fmsub.fbwks.com/api"
FRONTEND_URL="https://fmsubapp.fbwks.com"
# ----------------------------

echo "==> Building frontend with VITE_API_URL=${API_URL}"
pushd web >/dev/null
printf "VITE_API_URL=%s\n" "$API_URL" > .env.production
npm install
npm run build
popd >/dev/null

echo "==> Uploading frontend to $HOST_ALIAS:$REMOTE_FRONTEND_DIR"
rsync -az --delete web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"

echo "==> Ensuring SPA .htaccess exists on remote (no RewriteBase)"
ssh -T "$HOST_ALIAS" bash <<'EOF_HTACCESS'
set -euo pipefail
FRONT_DIR="/home4/fbwkscom/public_html/fmsubapp"
mkdir -p "$FRONT_DIR"

# Always (re)write a clean SPA router .htaccess without RewriteBase
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

# Sanity: show first lines and verify RewriteBase is absent
echo "---- .htaccess head ----"
sed -n '1,60p' "$FRONT_DIR/.htaccess"
echo "------------------------"
grep -n 'RewriteBase' "$FRONT_DIR/.htaccess" && { echo "ERROR: RewriteBase present"; exit 1; } || echo "OK: no RewriteBase"
EOF_HTACCESS

echo "==> Syncing backend source to $HOST_ALIAS:$REMOTE_APP_DIR"
RSYNC_EXCLUDES=(
  ".git/"
  "vendor/"
  "node_modules/"
  "storage/"
  ".env"
  "web/"
  "public/.storage.*"   # don't sync stray local symlinks
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
if ! command -v composer >/dev/null; then
  alias composer="/usr/local/bin/php $HOME/bin/composer"
fi

echo "==> Remove stale Laravel caches (avoid leaking local paths)"
rm -f bootstrap/cache/config.php \
      bootstrap/cache/packages.php \
      bootstrap/cache/services.php \
      bootstrap/cache/routes-*.php || true

echo "==> Composer install"
composer install --no-dev --optimize-autoloader

echo "==> Ensure storage/cache dirs exist & are writable"
mkdir -p storage/logs storage/framework/{cache,sessions,views} bootstrap/cache
chmod -R 775 storage bootstrap/cache || true

echo "==> Clear caches"
LOG_CHANNEL=stderr php artisan optimize:clear || true

echo "==> Run migrations"
php artisan migrate --force

echo "==> Fix storage symlink (for vendor images)"
rm -f public/storage
find public -maxdepth 1 -type l -name '.storage*' -exec rm -f {} \; || true
php artisan storage:link || true

echo "==> Rebuild caches"
LOG_CHANNEL=stderr php artisan config:cache
LOG_CHANNEL=stderr php artisan route:cache
php artisan view:cache

echo '==> Sanity: env values'
php -r 'echo "APP_URL=".($_ENV["APP_URL"]??getenv("APP_URL")??"").PHP_EOL;'
php -r 'echo "APP_FRONTEND_URL=".($_ENV["APP_FRONTEND_URL"]??getenv("APP_FRONTEND_URL")??"").PHP_EOL;'

echo "==> Health checks"
curl -sfI "https://fmsub.fbwks.com/api/ping" | head -n 1
curl -sfI -X OPTIONS "https://fmsub.fbwks.com/api/vendors" \
  -H "Origin: https://fmsubapp.fbwks.com" \
  -H "Access-Control-Request-Method: GET" | grep -i "Access-Control-Allow-Origin" || true
curl -sfI "https://fmsubapp.fbwks.com/" | head -n 1
curl -sfI "https://fmsubapp.fbwks.com/index.html" | head -n 1

echo "Server deploy complete."
EOF

echo "==> Done. Frontend: ${FRONTEND_URL} | API: ${API_URL}/ping"
