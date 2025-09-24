<?php

use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\VendorController;
use App\Http\Controllers\ProductsController;
use App\Http\Controllers\LocationsController;
use App\Http\Controllers\SubscriptionsController;
use App\Http\Controllers\AccountController;
use App\Http\Controllers\VendorMediaController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| All routes here are stateless JSON endpoints for the frontend app(s).
| CORS must include "api/*" in config/cors.php paths.
*/

// Health check
Route::get('/ping', fn () => response()->json(['ok' => true, 'ts' => now()->toISOString()]));

// Auth (Sanctum token-based)
Route::post('/auth/check-identity', [AuthController::class, 'checkIdentity']); 
Route::post('/auth/login',          [AuthController::class, 'login']);        
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('/me',           [AuthController::class, 'me'])->middleware('auth:sanctum');
Route::post('/auth/signup', [\App\Http\Controllers\AuthController::class, 'signup']);
Route::middleware('auth:sanctum')->group(function () {
Route::get('/account', [AccountController::class, 'show']);
Route::patch('/account', [AccountController::class, 'update']);
Route::middleware('auth:sanctum')->group(function () {
  Route::post('/vendors', [\App\Http\Controllers\VendorOnboardingController::class, 'store']);
});
Route::middleware('auth:sanctum')->group(function () {
  Route::post('/vendors/{vendor}/products', [\App\Http\Controllers\ProductController::class, 'store']);
  Route::patch('/products/{product}', [\App\Http\Controllers\ProductController::class, 'update']);
  Route::delete('/products/{product}', [\App\Http\Controllers\ProductController::class, 'destroy']);
});
});

// Public catalog endpoints
Route::get('/vendors',                       [VendorController::class,   'index']);
Route::get('/vendors/{vendor}',              [VendorController::class,   'show']);
Route::get('/vendors/{vendor}/products',     [ProductsController::class, 'byVendor']);
Route::get('/vendors/{vendor}/locations',    [LocationsController::class,'forVendor']);
Route::get('/vendors/{vendor}/qr.png', [VendorMediaController::class, 'qr'])->name('vendors.qr');
Route::get('/vendors/{vendor}/flyer.pdf', [VendorMediaController::class, 'flyer']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/vendors/{vendor}/assets', [VendorMediaController::class, 'upload']); // manage media/contact
});
Route::get('/products',                      [ProductsController::class, 'index']);
Route::get('/products/{product}',            [ProductsController::class, 'show']);
Route::get('/locations',                     [LocationsController::class,'index']);

// Authenticated user/vendor endpoints
Route::middleware('auth:sanctum')->group(function () {
    // Vendor membership utilities
    Route::get('/my/vendors',                    [VendorController::class, 'myVendors']);
    Route::patch('/vendors/{vendor}',            [VendorController::class, 'update']); // only owner/admin on that vendor

    // Subscriptions (MVP)
    Route::get('/subscriptions/mine',            [SubscriptionsController::class, 'mine']);
    Route::post('/subscriptions',                [SubscriptionsController::class, 'store']);
    Route::post('/subscriptions/{subscription}/pause',   [SubscriptionsController::class, 'pause']);
    Route::post('/subscriptions/{subscription}/resume',  [SubscriptionsController::class, 'resume']);
    Route::post('/subscriptions/{subscription}/cancel',  [SubscriptionsController::class, 'cancel']);
});