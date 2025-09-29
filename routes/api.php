<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\AuthController;
use App\Http\Controllers\AccountController;

use App\Http\Controllers\VendorController;
use App\Http\Controllers\VendorMediaController;
use App\Http\Controllers\VendorProductController;
use App\Http\Controllers\VendorOnboardingController;

use App\Http\Controllers\ProductsController;
use App\Http\Controllers\LocationsController;
use App\Http\Controllers\SubscriptionsController;
use App\Http\Controllers\VariantController;


/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| All routes here are stateless JSON endpoints for the frontend app(s).
| Ensure CORS includes "api/*" in config/cors.php paths.
*/

// ---------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------
Route::get('/ping', fn () => response()->json(['ok' => true, 'ts' => now()->toISOString()]));

// ---------------------------------------------------------------------
// Auth (public endpoints)
// ---------------------------------------------------------------------
Route::post('/auth/check-identity', [AuthController::class, 'checkIdentity']);
Route::post('/auth/login',          [AuthController::class, 'login']);
Route::post('/auth/signup',         [AuthController::class, 'signup']);

// ---------------------------------------------------------------------
// Authenticated (Sanctum) – user, account, onboarding
// ---------------------------------------------------------------------
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me',           [AuthController::class, 'me']);

    // Account
    Route::get('/account',   [AccountController::class, 'show']);
    Route::patch('/account', [AccountController::class, 'update']);

    // Become a vendor (onboarding)
    Route::post('/vendors', [VendorOnboardingController::class, 'store']);

    // Vendor favorites
    Route::post('/vendors/{vendor}/favorite',  [\App\Http\Controllers\VendorFavoritesController::class, 'store']);
    Route::delete('/vendors/{vendor}/favorite',[\App\Http\Controllers\VendorFavoritesController::class, 'destroy']);
    Route::get('/my/vendors/favorites',        [\App\Http\Controllers\VendorFavoritesController::class, 'index']);    

});

// ---------------------------------------------------------------------
// Public catalog
// ---------------------------------------------------------------------
Route::get('/vendors',                    [VendorController::class,   'index']);
Route::get('/vendors/{vendor}',           [VendorController::class,   'show'])->whereNumber('vendor');
Route::get('/vendors/{vendor}/products',  [ProductsController::class, 'byVendor'])->whereNumber('vendor');
Route::get('/vendors/{vendor}/locations', [LocationsController::class,'forVendor'])->whereNumber('vendor');

// Media (public QR/flyer)
Route::get('/vendors/{vendor}/qr.png',    [VendorMediaController::class, 'qr'])->whereNumber('vendor')->name('vendors.qr');
Route::get('/vendors/{vendor}/flyer.pdf', [VendorMediaController::class, 'flyer'])->whereNumber('vendor');

// Products (public browse)
Route::get('/products',                   [ProductsController::class, 'index']);
Route::get('/products/{product}',         [ProductsController::class, 'show'])->whereNumber('product');

// ---------------------------------------------------------------------
// Authenticated vendor actions
// ---------------------------------------------------------------------
Route::middleware('auth:sanctum')->group(function () {

    // Vendor membership utilities
    Route::get('/my/vendors',         [VendorController::class, 'myVendors']);
    Route::patch('/vendors/{vendor}', [VendorController::class, 'update'])->whereNumber('vendor');

    // Vendor media/contact
    Route::post('/vendors/{vendor}/assets', [VendorMediaController::class, 'upload'])->whereNumber('vendor');

    // --- Vendor-scoped product CRUD ---
    // Use scoped bindings so {product} must belong to {vendor}
    Route::scopeBindings()->group(function () {
        Route::post  ('/vendors/{vendor}/products',                 [VendorProductController::class, 'store'])->whereNumber('vendor');
        Route::patch ('/vendors/{vendor}/products/{product}',       [VendorProductController::class, 'update'])->whereNumber(['vendor','product']);
        Route::put   ('/vendors/{vendor}/products/{product}',       [VendorProductController::class, 'update'])->whereNumber(['vendor','product']);
        Route::delete('/vendors/{vendor}/products/{product}',       [VendorProductController::class, 'destroy'])->whereNumber(['vendor','product'])->name('vendor.products.destroy');
        Route::post  ('/vendors/{vendor}/products/{product}/image', [VendorProductController::class, 'uploadImage'])->whereNumber(['vendor','product']);
        Route::patch('/variants/{variant}', [VariantController::class, 'update']);
        
        Route::post('/vendors/{vendor}/products/{product}/variants', [\App\Http\Controllers\VariantController::class, 'store'])
        ->whereNumber(['vendor','product']);

        Route::delete('/variants/{variant}', [\App\Http\Controllers\VariantController::class, 'destroy'])
        ->whereNumber('variant');
    });

    // Subscriptions (MVP)
    Route::get ('/subscriptions/mine',                  [SubscriptionsController::class, 'mine']);
    Route::post('/subscriptions',                       [SubscriptionsController::class, 'store']);
    Route::post('/subscriptions/{subscription}/pause',  [SubscriptionsController::class, 'pause'])->whereNumber('subscription');
    Route::post('/subscriptions/{subscription}/resume', [SubscriptionsController::class, 'resume'])->whereNumber('subscription');
    Route::post('/subscriptions/{subscription}/cancel', [SubscriptionsController::class, 'cancel'])->whereNumber('subscription');

    
});

// ---------------------------------------------------------------------
// Debug echo (only when APP_DEBUG=true)
// ---------------------------------------------------------------------
if (config('app.debug')) {
    Route::post('/_debug/request', function (Request $request) {
        if (!config('app.debug')) {
            return response()->json(['error' => 'Debug disabled'], 403);
        }

        return response()->json([
            'method'  => $request->method(),
            'path'    => $request->path(),
            'headers' => collect($request->headers->all())->map(fn ($v) => implode(', ', $v)),
            'inputs'  => $request->all(),
            'files'   => collect($request->allFiles())->map(fn ($f) => [
                'original' => $f->getClientOriginalName(),
                'mime'     => $f->getClientMimeType(),
                'size'     => $f->getSize(),
                'ext'      => $f->getClientOriginalExtension(),
            ]),
        ]);
    });
}