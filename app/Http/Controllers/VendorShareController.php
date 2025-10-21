<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Jaybizzle\CrawlerDetect\CrawlerDetect;
use App\Models\Vendor;

class VendorShareController extends Controller
{
    public function show(Request $request, int $id)
    {
        $crawler = new CrawlerDetect();

        // Load the vendor (adjust relations/columns as you like)
        $vendor = Vendor::query()->findOrFail($id);

        // Decide which image to use
        $image = $vendor->photo_url ?: $vendor->banner_url ?: url('/og/og-default.jpg');

        // Human-friendly text for description
        $desc = trim($vendor->flyer_text ?: $vendor->description ?: 'Find local vendors on Farmers Market Reserve.');

        // If a crawler -> return a tiny HTML page with OG/Twitter tags
        if ($crawler->isCrawler($request->userAgent())) {
            return response()->view('og.vendor', [
                'title'       => $vendor->name,
                'description' => $desc,
                'image'       => $image,
                'url'         => url("/vendors/{$vendor->id}"),
                'siteName'    => 'Farmers Market Reserve',
                'theme'       => '#B45309',
            ]);
        }

        // Normal browsers: serve your built SPA index.html
        // (After `vite build`, index.html + assets live in public/)
        return response()->file(public_path('index.html'));
    }
}