<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AccountController extends Controller
{
    // GET /api/account
    public function show(Request $request)
    {
        return response()->json(
            $request->user()->only(['id', 'name', 'email', 'phone'])
        );
    }

    // PATCH /api/account
    public function update(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name'  => ['sometimes','string','max:255'],
            'email' => [
                'sometimes','nullable','email','max:255',
                Rule::unique('users','email')->ignore($user->id),
            ],
            'phone' => [
                'sometimes','nullable','string','max:32',
                Rule::unique('users','phone')->ignore($user->id),
            ],
        ]);

        // normalize phone if provided
        if (array_key_exists('phone', $data) && $data['phone']) {
            $data['phone'] = $this->normalizePhone($data['phone']);
        }

        $user->fill($data)->save();

        return response()->json($user->only(['id','name','email','phone']));
    }

    // POST /api/account/change-password
    public function changePassword(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'current_password' => ['required','string'],
            'new_password'     => ['required','string','min:8','confirmed'],
        ]);

        // Verify current password
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The provided current password is incorrect.']
            ]);
        }

        // Update
        $user->password = Hash::make($data['new_password']);
        $user->save();

        return response()->json(['message' => 'Password changed']);
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
}