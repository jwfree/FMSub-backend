<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use App\Models\User;
use App\Models\Vendor;
use App\Models\VendorUser;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Customer;
use App\Models\Subscription;

class DemoSeeder extends Seeder
{
    public function run()
    {
        // Create an admin user
        $admin = User::firstOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Admin',
                'password' => Hash::make('secret123'),
                'role' => 'admin',
            ]
        );

        // Create a demo vendor
        $vendor = Vendor::firstOrCreate(
            ['contact_email' => 'vendor@example.com'],
            [
                'name' => 'Demo Vendor',
                'active' => true,
            ]
        );

        // Link admin to vendor as owner
        VendorUser::firstOrCreate(
            ['vendor_id' => $vendor->id, 'user_id' => $admin->id],
            ['role' => 'owner']
        );

        // Add a product
        $product = Product::firstOrCreate(
            ['vendor_id' => $vendor->id, 'name' => 'Farm Fresh Eggs'],
            [
                'description' => 'A dozen local free-range eggs.',
                'unit' => 'dozen',
                'active' => true,
            ]
        );

        // Add a variant
        $variant = ProductVariant::firstOrCreate(
            ['product_id' => $product->id, 'sku' => 'EGG-12'],
            [
                'name' => '12 eggs',
                'price_cents' => 500,
                'currency' => 'USD',
                'active' => true,
            ]
        );

        // Create a customer
        $customerUser = User::firstOrCreate(
            ['email' => 'customer@example.com'],
            [
                'name' => 'Demo Customer',
                'password' => Hash::make('secret123'),
                'role' => 'customer',
            ]
        );

        $customer = Customer::firstOrCreate(
            ['user_id' => $customerUser->id],
            [
                'phone' => '555-123-4567',
                'notification_opt_in' => true,
            ]
        );

        // Create a subscription
        Subscription::firstOrCreate(
            [
                'customer_id' => $customer->id,
                'product_id' => $product->id,
                'product_variant_id' => $variant->id,
            ],
            [
                'quantity' => 1,
                'frequency' => 'weekly',
                'start_date' => now(),
                'status' => 'active',
            ]
        );
    }
}