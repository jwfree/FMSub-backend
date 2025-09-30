<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Vendor;

class VendorPolicy
{
    /**
     * Anyone attached to the vendor can view it.
     */
    public function view(User $user, Vendor $vendor): bool
    {
        return $vendor->users()
            ->where('users.id', $user->id)
            ->exists();
    }

    /**
     * Only elevated roles can update the vendor.
     * Adjust the allowed roles to match your needs.
     */
    public function update(User $user, Vendor $vendor): bool
    {
        return $vendor->users()
            ->where('users.id', $user->id)
            ->wherePivotIn('role', ['owner', 'manager'])
            ->exists();
    }
}