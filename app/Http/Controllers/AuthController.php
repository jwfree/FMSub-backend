<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    // POST /api/auth/check-identity
    // body: { identity: "<email or phone>" }
    public function checkIdentity(Request $request)
    {
        $data = $request->validate([
            'identity' => ['required','string','max:255'],
        ]);

        [$type, $normalized] = $this->parseIdentity($data['identity']);

        $exists = false;
        if ($type === 'email') {
            $exists = User::where('email', $normalized)->exists();
        } else {
            $exists = Customer::where('phone', $normalized)->exists();
        }

        return response()->json([
            'exists'   => $exists,
            'type'     => $type,        // 'email' | 'phone'
            'identity' => $normalized,  // normalized value
        ]);
    }

    // POST /api/auth/login
    // body: { identity: "<email or phone>", password: "..." }
    public function login(Request $request)
    {
        $data = $request->validate([
            'identity' => ['required','string','max:255'],
            'password' => ['required','string'],
        ]);

        [$type, $normalized] = $this->parseIdentity($data['identity']);

        // Resolve the user from email or phone
        if ($type === 'email') {
            $user = User::where('email', $normalized)->first();
        } else {
            $cust = Customer::where('phone', $normalized)->first();
            $user = $cust?->user; // assumes Customer belongsTo User
        }

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        Auth::loginUsingId($user->id); // no session cookie used; we’ll issue token
        $token = $user->createToken('mvp')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => $user->only(['id','name','email']),
        ]);
    }
    public function signup(Request $request)
    {
        $data = $request->validate([
            'identity' => ['required','string','max:255'], // email OR phone
            'password' => ['required','string','min:8'],
            'name'     => ['nullable','string','max:255'],
        ]);

        [$type, $normalized] = $this->parseIdentity($data['identity']);

        // Prevent duplicates
        if ($type === 'email') {
            $exists = \App\Models\User::where('email', mb_strtolower($normalized))->exists();
        } else {
            $exists = \App\Models\Customer::where('phone', $normalized)->exists();
        }
        if ($exists) {
            return response()->json([
                'message' => 'Account already exists. Please log in.'
            ], 409);
        }

        // Create User (email may not be available for phone-only signups)
        // If your users.email column is NOT nullable, we’ll generate a placeholder email.
        $emailForUser = null;
        if ($type === 'email') {
            $emailForUser = mb_strtolower($normalized);
        } else {
            // placeholder to satisfy non-null/unique email if needed
            // ensures uniqueness per phone value
            $emailForUser = "phone+{$normalized}@signup.local";
        }

        $user = \App\Models\User::create([
            'name'     => $data['name'] ?? 'Customer',
            'email'    => $emailForUser,
            'password' => \Illuminate\Support\Facades\Hash::make($data['password']),
            // keep any other fillables you use (e.g., 'role' => 'customer')
        ]);

        // Ensure there’s a Customer profile and store phone if phone signup
        $customer = \App\Models\Customer::firstOrCreate(
            ['user_id' => $user->id],
            [
                'phone' => $type === 'phone' ? $normalized : null,
                'notification_opt_in' => true,
            ]
        );

        // Issue token
        $token = $user->createToken('mvp')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => $user->only(['id','name','email']),
        ], 201);
    }

    /**
     * Helpers (reuse if you already added them)
     */
    private function parseIdentity(string $raw): array
    {
        $candidate = trim($raw);
        if (str_contains($candidate, '@')) {
            return ['email', mb_strtolower($candidate)];
        }
        return ['phone', $this->normalizePhone($candidate)];
    }

    private function normalizePhone(string $raw): string
    {
        $raw = trim($raw);
        if (str_starts_with($raw, '+')) {
            $digits = preg_replace('/\D+/', '', substr($raw, 1));
            return '+' . $digits;
        }
        return preg_replace('/\D+/', '', $raw);
    }
        // POST /api/auth/logout (unchanged)
        public function logout(Request $request)
        {
            $request->user()?->currentAccessToken()?->delete();
            return response()->json(['ok' => true]);
        }

        // GET /api/me (unchanged)
        public function me(Request $request)
        {
            return response()->json($request->user());
        }

        /**
         * Helpers
         */
        private function parseIdentity(string $raw): array
        {
            $candidate = trim($raw);

            if (str_contains($candidate, '@')) {
                // Treat as email (lowercase)
                return ['email', mb_strtolower($candidate)];
            }

            // Treat as phone: strip non-digits; keep leading + if present
            $normalized = $this->normalizePhone($candidate);
            return ['phone', $normalized];
        }

        private function normalizePhone(string $raw): string
        {
            $raw = trim($raw);
            // keep leading + if present, remove all non-digits otherwise
            if (str_starts_with($raw, '+')) {
                $digits = preg_replace('/\D+/', '', substr($raw, 1));
                return '+' . $digits;
            }
            return preg_replace('/\D+/', '', $raw);
        }
}