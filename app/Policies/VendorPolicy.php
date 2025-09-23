<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Vendor;

class VendorPolicy
{
    public function update(User $user, Vendor $vendor): bool
    {
        // Owner/admin on the pivot can edit
        $role = $vendor->users()
            ->where('users.id', $user->id)
            ->first()?->pivot?->role;

        return in_array($role, ['owner','admin'], true);
    }
}