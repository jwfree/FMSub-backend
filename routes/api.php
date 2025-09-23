<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ProductsController;
use App\Http\Controllers\LocationsController;
use App\Http\Controllers\VendorController;
use App\Http\Controllers\SubscriptionsController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| All routes here are stateless JSON endpoints for the frontend app(s).
| CORS must include "api/*" in config/cors.php paths.
*/

/**
 * Health check
 */
Route::get('/ping', fn () => response()->json(['ok' => true, 'ts' => now()->toISOString()]));

/**
 * Auth (Sanctum token-based)
 */
Route::post('/auth/login',  [AuthController::class, 'login']);
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('/me',           [AuthController::class, 'me'])->middleware('auth:sanctum');

/**
 * Public catalog endpoints
 */
Route::get('/vendors',                 [VendorController::class,   'index']);
Route::get('/vendors/{vendor}',        [VendorController::class,   'show']);
Route::get('/vendors/{vendor}/products',[ProductsController::class,'byVendor']);
Route::get('/vendors/{vendor}/locations',[LocationsController::class,'forVendor']);

Route::get('/products',                [ProductsController::class, 'index']);
Route::get('products/{product}', [ProductsController::class, 'show']);
Route::get('/locations',               [LocationsController::class,'index']);

/**
 * Authenticated user/vendor endpoints
 */
Route::middleware('auth:sanctum')->group(function () {
    // Vendor membership utilities
    Route::get('/my/vendors',              [VendorController::class, 'myVendors']);
    Route::patch('/vendors/{vendor}',      [VendorController::class, 'update']); // only owner/admin on that vendor

    // Subscriptions (MVP)
    Route::get('/subscriptions/mine',      [SubscriptionsController::class, 'mine']);         // current user’s subs
    Route::post('/subscriptions',          [SubscriptionsController::class, 'store']);        // create a sub (pre-Stripe)
    Route::post('/subscriptions/{subscription}/pause',  [SubscriptionsController::class, 'pause']);
    Route::post('/subscriptions/{subscription}/resume', [SubscriptionsController::class, 'resume']);
    Route::post('/subscriptions/{subscription}/cancel', [SubscriptionsController::class, 'cancel']);
});
use App\Http\Controllers\ProductsController;
use App\Http\Controllers\SubscriptionsController;

Route::get('products/{product}', [ProductsController::class, 'show']);   // product detail
Route::post('subscriptions', [SubscriptionsController::class, 'store']); // create subscription

import ProductDetail from "./pages/ProductDetail";

// …
<Routes>
  <Route path="/" element={<Browse />} />
  <Route path="/browse" element={<Browse />} />
  <Route path="/products/:id" element={<ProductDetail />} />
  {/* login, etc. */}
</Routes>