<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    public function login(Request $r)
    {
        $creds = $r->validate([
            'email' => 'required|email',
            'password' => 'required'
        ]);

        if (!Auth::attempt($creds)) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        $user  = $r->user();
        $token = $user->createToken('mvp')->plainTextToken;

        return response()->json(['token' => $token, 'user' => $user]);
    }

    public function me(Request $r)
    {
        return $r->user();
    }

    public function logout(Request $r)
    {
        $r->user()->currentAccessToken()?->delete();
        return ['ok' => true];
    }
}