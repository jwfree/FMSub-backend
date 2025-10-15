<?php

namespace App\Http\Controllers;

use App\Models\UserAddress;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserAddressController extends Controller
{
    public function index(Request $req)
    {
        $this->middleware('auth');
        $user = $req->user();

        $addresses = UserAddress::where('user_id', $user->id)
            ->orderByDesc('is_default')
            ->orderBy('created_at')
            ->get();

        return response()->json($addresses);
    }

    public function store(Request $req)
    {
        $this->middleware('auth');
        $user = $req->user();

        $data = $req->validate([
            'label'          => ['nullable','string','max:80'],
            'recipient_name' => ['nullable','string','max:120'],
            'phone'          => ['nullable','string','max:40'],

            'line1'       => ['required','string','max:160'],
            'line2'       => ['nullable','string','max:160'],
            'city'        => ['required','string','max:120'],
            'state'       => ['nullable','string','max:80'],
            'postal_code' => ['required','string','max:32'],
            'country'     => ['nullable','string','size:2'],

            'is_default'   => ['sometimes','boolean'],
            'instructions' => ['nullable','string','max:500'],
        ]);

        $data['user_id'] = $user->id;
        $data['country'] = $data['country'] ?? 'US';

        // If new one is default, unset previous defaults
        if (!empty($data['is_default'])) {
            UserAddress::where('user_id', $user->id)->update(['is_default' => false]);
        }

        $addr = UserAddress::create($data);

        return response()->json($addr, 201);
    }

    public function update(Request $req, int $id)
    {
        $this->middleware('auth');
        $user = $req->user();

        $addr = UserAddress::where('user_id', $user->id)->findOrFail($id);

        $data = $req->validate([
            'label'          => ['sometimes','nullable','string','max:80'],
            'recipient_name' => ['sometimes','nullable','string','max:120'],
            'phone'          => ['sometimes','nullable','string','max:40'],

            'line1'       => ['sometimes','required','string','max:160'],
            'line2'       => ['sometimes','nullable','string','max:160'],
            'city'        => ['sometimes','required','string','max:120'],
            'state'       => ['sometimes','nullable','string','max:80'],
            'postal_code' => ['sometimes','required','string','max:32'],
            'country'     => ['sometimes','nullable','string','size:2'],

            'is_default'   => ['sometimes','boolean'],
            'instructions' => ['sometimes','nullable','string','max:500'],
        ]);

        if (array_key_exists('is_default', $data) && $data['is_default']) {
            UserAddress::where('user_id', $user->id)->update(['is_default' => false]);
        }

        $addr->update($data);

        return response()->json($addr);
    }

    public function destroy(Request $req, int $id)
    {
        $this->middleware('auth');
        $user = $req->user();

        $addr = UserAddress::where('user_id', $user->id)->findOrFail($id);
        $addr->delete();

        return response()->json(['ok' => true]);
    }

    public function makeDefault(Request $req, int $id)
    {
        $this->middleware('auth');
        $user = $req->user();

        $addr = UserAddress::where('user_id', $user->id)->findOrFail($id);

        UserAddress::where('user_id', $user->id)->update(['is_default' => false]);
        $addr->is_default = true;
        $addr->save();

        return response()->json($addr);
    }
}