#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/web"
printf "VITE_API_URL=https://fmsub.fbwks.com/api\n" > .env.production
npm run build
rsync -az --delete dist/ fbwkscom@box2413.bluehost.com:/home4/fbwkscom/public_html/fmsubapp/
echo "Frontend deployed to https://fmsubapp.fbwks.com"
