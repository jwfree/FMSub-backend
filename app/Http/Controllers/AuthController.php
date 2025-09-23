<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    // POST /api/auth/check-identity  { identity }
    public function checkIdentity(Request $request)
    {
        $data = $request->validate([
            'identity' => ['required','string','max:255'],
        ]);
        [$type, $value] = $this->parseIdentity($data['identity']);

        $exists = $type === 'email'
            ? User::where('email', $value)->exists()
            : User::where('phone', $value)->exists();

        return response()->json([
            'exists'   => $exists,
            'type'     => $type,
            'identity' => $value,
        ]);
    }

    // POST /api/auth/login { identity, password }
    public function login(Request $request)
    {
        $data = $request->validate([
            'identity' => ['required','string','max:255'],
            'password' => ['required','string'],
        ]);
        [$type, $value] = $this->parseIdentity($data['identity']);

        $user = $type === 'email'
            ? User::where('email', $value)->first()
            : User::where('phone', $value)->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        Auth::loginUsingId($user->id);
        $token = $user->createToken('mvp')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => $user->only(['id','name','email','phone']),
        ]);
    }

    // POST /api/auth/signup { identity, password, name? }
    public function signup(Request $request)
    {
        $data = $request->validate([
            'identity' => ['required','string','max:255'],
            'password' => ['required','string','min:8'],
            'name'     => ['nullable','string','max:255'],
        ]);

        [$type, $value] = $this->parseIdentity($data['identity']);

        // Uniqueness check on users
        $exists = $type === 'email'
            ? User::where('email', $value)->exists()
            : User::where('phone', $value)->exists();

        if ($exists) {
            return response()->json(['message' => 'Account already exists. Please log in.'], 409);
        }

        // Create user
        $user = User::create([
            'name'     => $data['name'] ?? 'Customer',
            'email'    => $type === 'email' ? $value : null,
            'phone'    => $type === 'phone' ? $value : null,
            'password' => Hash::make($data['password']),
        ]);

        // Ensure a Customer profile exists (keep if you want vendor/customer separation)
        Customer::firstOrCreate(
            ['user_id' => $user->id],
            [
                'phone' => $type === 'phone' ? $value : null,
                'notification_opt_in' => true,
            ]
        );

        $token = $user->createToken('mvp')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => $user->only(['id','name','email','phone']),
        ], 201);
    }

    // POST /api/auth/logout
    public function logout(Request $request)
    {
        $request->user()?->currentAccessToken()?->delete();
        return response()->json(['ok' => true]);
    }

    // GET /api/me
    public function me(Request $request)
    {
        return response()->json($request->user()->only(['id','name','email','phone']));
    }

    /** Helpers */
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
        // keep only digits
        return preg_replace('/\D+/', '', trim($raw));
    }

}