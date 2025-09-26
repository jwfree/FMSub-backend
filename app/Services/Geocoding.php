<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

class Geocoding
{
    /**
     * Geocode an address via OpenStreetMap Nominatim.
     * Returns ['lat' => float, 'lng' => float] or null if not found.
     */
    public static function geocode(array $addr): ?array
    {
        // Build a single free-form query string from the parts you have
        $parts = array_filter([
            $addr['address_line1'] ?? null,
            $addr['address_line2'] ?? null,
            $addr['city'] ?? null,
            $addr['region'] ?? null,
            $addr['postal_code'] ?? null,
            $addr['country'] ?? null,
        ]);
        if (!$parts) {
            return null;
        }
        $q = implode(', ', $parts);

        try {
            $resp = Http::timeout(8)
                ->withHeaders([
                    'User-Agent' => 'FMSUB/1.0 (support@fbwks.com)'
                ])
                ->get('https://nominatim.openstreetmap.org/search', [
                    'q' => $q,
                    'format' => 'json',
                    'limit' => 1,
                ]);

            if (!$resp->ok()) return null;

            $first = $resp->json()[0] ?? null;
            if (!$first || !isset($first['lat'], $first['lon'])) return null;

            return [
                'lat' => (float)$first['lat'],
                'lng' => (float)$first['lon'],
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }
}