<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->file(public_path('index.html')));

// SPA catch-all (anything not /api/* goes to React)
Route::get('/{any}', fn () => response()->file(public_path('index.html')))
    ->where('any', '^(?!api/).*$');