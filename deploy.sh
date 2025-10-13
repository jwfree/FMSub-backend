#!/usr/bin/env bash
set -euo pipefail

# ---------------- CONFIG ----------------
HOST_ALIAS="bluehost"  # must exist in ~/.ssh/config
REMOTE_APP_DIR="/home4/fbwkscom/apps/fmsub-backend"
REMOTE_FRONTEND_DIR="/home4/fbwkscom/public_html/fmsubapp"
API_URL="https://fmsub.fbwks.com/api"
FRONTEND_URL="https://fmsubapp.fbwks.com"
# ----------------------------------------

# ---- utils ----
log() { printf "\n==> %s\n" "$*"; }
warn() { printf "\n[warn] %s\n" "$*" >&2; }
die() { printf "\n[error] %s\n" "$*" >&2; exit 1; }

# Make rsync a bit more resilient on shared hosts (keepalive)
export RSYNC_RSH="ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6"

# Common rsync opts for robustness + nice progress:
# Use only options supported by older rsync versions (BlueHost often runs <3.1)
RSYNC_BASE_OPTS=(-az --human-readable --delete-after --partial --inplace --stats --progress)

rsync_with_retry() {
  # usage: rsync_with_retry <rsync-args...>
  local max=3 attempt=1
  while :; do
    if rsync "${RSYNC_BASE_OPTS[@]}" "$@"; then
      return 0
    fi
    if (( attempt >= max )); then
      die "rsync failed after ${max} attempts"
    fi
    warn "rsync failed (attempt ${attempt}/${max}). Retrying in 3s…"
    sleep 3
    attempt=$((attempt+1))
  done
}

log "Building frontend with VITE_API_URL=${API_URL}"
pushd web >/dev/null
printf "VITE_API_URL=%s\n" "$API_URL" > .env.production

# prefer npm ci if lockfile present
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run build
popd >/dev/null

log "Removing any web/dist/.htaccess (we deploy our own)"
rm -f web/dist/.htaccess || true

log "Uploading frontend to $HOST_ALIAS:$REMOTE_FRONTEND_DIR (excluding any .htaccess/.DS_Store)"
rsync_with_retry \
  --exclude='.htaccess' \
  --exclude='.DS_Store' \
  web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"

log "Ensuring SPA .htaccess exists on remote (no RewriteBase)"
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

# Quick integrity check: dry-run with checksums; if anything would copy, warn
log "Verifying frontend upload (checksum dry-run)"
if rsync -az --checksum --dry-run --delete-after --exclude='.htaccess' --exclude='.DS_Store' web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/" | grep -qvE '^\s*$'; then
  warn "Checksum verification found differences after upload. A second sync will run."
  rsync_with_retry --checksum --exclude='.htaccess' --exclude='.DS_Store' web/dist/ "$HOST_ALIAS:$REMOTE_FRONTEND_DIR/"
else
  log "Frontend verified."
fi

log "Syncing backend source to $HOST_ALIAS:$REMOTE_APP_DIR"
# IMPORTANT: exclude public/storage to avoid uploading a local symlink
RSYNC_EXCLUDES=(
  ".git/"
  "vendor/"
  "node_modules/"
  "storage/"
  ".env"
  "web/"
  "public/storage"    # <-- never upload local storage link/dir
  ".DS_Store"
)
RSYNC_ARGS=()
for e in "${RSYNC_EXCLUDES[@]}"; do RSYNC_ARGS+=(--exclude "$e"); done
rsync_with_retry "${RSYNC_ARGS[@]}" ./ "$HOST_ALIAS:$REMOTE_APP_DIR/"

log "Running server-side Composer/Artisan"
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
  # NOTE: subdomain docroot is /, not /fmsubapp/
  curl -sfI "https://fmsubapp.fbwks.com/" | head -n 1 || true
  curl -sfI "https://fmsubapp.fbwks.com/index.html" | head -n 1 || true

  echo "Server deploy complete."
EOF

log "Done. Frontend: ${FRONTEND_URL} | API: ${API_URL}/ping"
