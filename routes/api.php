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
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\WaitlistController;
use App\Http\Controllers\UserAddressController;
use App\Http\Controllers\NotificationsController;
use App\Http\Controllers\VendorFavoritesController;
use App\Http\Controllers\StripeController;
use App\Http\Controllers\PaymentsController;  

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

Route::post('/stripe/webhook', [\App\Http\Controllers\StripeWebhookController::class, 'handle']);

// ---------------------------------------------------------------------
// Public catalog / media / availability
// ---------------------------------------------------------------------
Route::get('/vendors',                               [VendorController::class,   'index']);
Route::get('/vendors/{vendor}',                      [VendorController::class,   'show'])->whereNumber('vendor');
Route::get('/vendors/{vendor}/products',             [ProductsController::class, 'byVendor'])->whereNumber('vendor');
Route::get('/vendors/{vendor}/locations',            [LocationsController::class,'forVendor'])->whereNumber('vendor');

Route::get('/vendors/{vendor}/qr.png',               [VendorMediaController::class, 'qr'])->whereNumber('vendor')->name('vendors.qr');
Route::get('/vendors/{vendor}/flyer.pdf',            [VendorMediaController::class, 'flyer'])->whereNumber('vendor');

Route::get('/products',                              [ProductsController::class, 'index']);
Route::get('/products/{product}',                    [ProductsController::class, 'show'])->whereNumber('product');

// Public read of availability for a vendor (for product availability widgets)
Route::get('/vendors/{vendor}/inventory',            [InventoryController::class, 'index'])->whereNumber('vendor');

// ---------------------------------------------------------------------
// Authenticated (Sanctum) – account, favorites, addresses, waitlist (mine)
// ---------------------------------------------------------------------
Route::middleware('auth:sanctum')->group(function () {
    // Session / me
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/me',           [AuthController::class, 'me']);

    // Account
    Route::get('/account',                    [AccountController::class, 'show']);
    Route::patch('/account',                  [AccountController::class, 'update']);
    Route::post('/account/change-password',   [AccountController::class, 'changePassword']);

    // Become a vendor (onboarding)
    Route::post('/vendors', [VendorOnboardingController::class, 'store']);

    // Vendor favorites
    Route::post  ('/vendors/{vendor}/favorite',   [VendorFavoritesController::class, 'store'])->whereNumber('vendor');
    Route::delete('/vendors/{vendor}/favorite',   [VendorFavoritesController::class, 'destroy'])->whereNumber('vendor');
    Route::get   ('/my/vendors/favorites',        [VendorFavoritesController::class, 'index']);

    // My addresses
    Route::get   ('/me/addresses',              [UserAddressController::class, 'index']);
    Route::post  ('/me/addresses',              [UserAddressController::class, 'store']);
    Route::patch ('/me/addresses/{id}',         [UserAddressController::class, 'update'])->whereNumber('id');
    Route::delete('/me/addresses/{id}',         [UserAddressController::class, 'destroy'])->whereNumber('id');
    Route::post  ('/me/addresses/{id}/default', [UserAddressController::class, 'makeDefault'])->whereNumber('id');

    // Waitlist (mine)
    Route::get   ('/waitlists/mine',            [WaitlistController::class, 'mine']);
    Route::delete('/waitlists/{entry}',         [WaitlistController::class, 'destroyMine'])->whereNumber('entry');

    // In-app notifications
    Route::get   ('/notifications',                 [NotificationsController::class, 'index']);
    Route::patch ('/notifications/{notification}/read', [NotificationsController::class, 'markRead'])->whereNumber('notification');
    Route::patch ('/notifications/read-all',        [NotificationsController::class, 'markAllRead']);
    Route::delete('/notifications/{notification}',  [NotificationsController::class, 'destroy'])->whereNumber('notification');

    // Notification preferences
    Route::get ('/notification-preferences',  [NotificationsController::class, 'getPreferences']);
    Route::put ('/notification-preferences',  [NotificationsController::class, 'updatePreferences']);
});

// ---------------------------------------------------------------------
// Authenticated vendor actions (management)
// ---------------------------------------------------------------------
Route::middleware('auth:sanctum')->group(function () {

    // Vendor membership utilities
    Route::get('/my/vendors',         [VendorController::class, 'myVendors']);
    Route::patch('/vendors/{vendor}', [VendorController::class, 'update'])->whereNumber('vendor');

    // Vendor media/contact
    Route::post('/vendors/{vendor}/assets', [VendorMediaController::class, 'upload'])->whereNumber('vendor');
    
    // --- Stripe Connect (vendor-scoped) ---
    Route::post('/vendors/{vendor}/stripe/connect-link', [StripeController::class, 'createConnectLink'])
        ->whereNumber('vendor')
        ->middleware('can:update,vendor');

    Route::post('/vendors/{vendor}/stripe/login-link',   [StripeController::class, 'createLoginLink'])
        ->whereNumber('vendor')
        ->middleware('can:update,vendor');

    // --- Vendor-scoped product CRUD (scoped bindings ensure product belongs to vendor) ---
    Route::scopeBindings()->group(function () {
        Route::post  ('/vendors/{vendor}/products',                 [VendorProductController::class, 'store'])->whereNumber('vendor');
        Route::patch ('/vendors/{vendor}/products/{product}',       [VendorProductController::class, 'update'])->whereNumber(['vendor','product']);
        Route::put   ('/vendors/{vendor}/products/{product}',       [VendorProductController::class, 'update'])->whereNumber(['vendor','product']);
        Route::delete('/vendors/{vendor}/products/{product}',       [VendorProductController::class, 'destroy'])->whereNumber(['vendor','product'])->name('vendor.products.destroy');
        Route::post  ('/vendors/{vendor}/products/{product}/image', [VendorProductController::class, 'uploadImage'])->whereNumber(['vendor','product']);

        // Variants
        Route::post  ('/vendors/{vendor}/products/{product}/variants', [VariantController::class, 'store'])->whereNumber(['vendor','product']);
        Route::patch ('/variants/{variant}',                            [VariantController::class, 'update'])->whereNumber('variant');
        Route::delete('/variants/{variant}',                            [VariantController::class, 'destroy'])->whereNumber('variant');

        // --- Inventory (vendor managed) ---
        Route::post  ('/vendors/{vendor}/inventory/entries',       [InventoryController::class, 'store'])->whereNumber('vendor')->middleware('can:update,vendor');
        Route::patch ('/vendors/{vendor}/inventory/entries/{id}',  [InventoryController::class, 'update'])->whereNumber(['vendor','id'])->middleware('can:update,vendor');
        Route::delete('/vendors/{vendor}/inventory/entries/{id}',  [InventoryController::class, 'destroy'])->whereNumber(['vendor','id'])->middleware('can:update,vendor');
        Route::post('/vendors/{vendor}/inventory/entries/bulk', [InventoryController::class, 'storeBulk'])->whereNumber('vendor')->middleware('can:update,vendor');

        // Delivery actions
        Route::patch('/vendors/{vendor}/inventory/deliveries/{id}/ready',   [InventoryController::class, 'readyDelivery'])->whereNumber(['vendor','id'])->middleware('can:update,vendor');
        Route::patch('/vendors/{vendor}/inventory/deliveries/{id}/cancel',  [InventoryController::class, 'cancelDelivery'])->whereNumber(['vendor','id'])->middleware('can:update,vendor');
        Route::patch('/vendors/{vendor}/inventory/deliveries/{id}/fulfill', [InventoryController::class, 'fulfillDelivery'])->whereNumber(['vendor','id'])->middleware('can:update,vendor');
    });

    // ✅ Payments (mark paid manually)
    Route::post('/payments/{payment}/mark-paid', [PaymentsController::class, 'markPaid'])
        ->whereNumber('payment');

    // -------------------------
    // Waitlist routes
    // -------------------------
    Route::post('/waitlist', [WaitlistController::class, 'store']);
    Route::get   ('/vendors/{vendor}/waitlist',                 [WaitlistController::class, 'indexByVendor'])->whereNumber('vendor');
    Route::delete('/vendors/{vendor}/waitlist/{entry}',         [WaitlistController::class, 'destroy'])->whereNumber(['vendor','entry']);
    Route::post  ('/vendors/{vendor}/waitlist/{entry}/convert', [WaitlistController::class, 'convertToOrder'])->whereNumber(['vendor','entry']);

    // -------------------------
    // Subscriptions (MVP)
    // -------------------------
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