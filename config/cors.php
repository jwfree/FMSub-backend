<?php

$origins = array_filter(array_map('trim', explode(',', env('CORS_ALLOWED_ORIGINS', ''))));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_origins' => $origins ?: ['https://fmsubapp.fbwks.com'],
    'allowed_methods' => ['*'],
    'allowed_headers' => ['*'],
    'supports_credentials' => (bool) env('CORS_SUPPORTS_CREDENTIALS', false),
    'exposed_headers' => [],
    'max_age' => 0,
];