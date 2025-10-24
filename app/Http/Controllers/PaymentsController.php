<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Payment;
use App\Models\Vendor;

class PaymentsController extends Controller
{
    /**
     * Mark a payment as paid (for manual/cash scenarios)
     * Route: POST /api/payments/{payment}/mark-paid
     */
    public function markPaid(Request $req, Payment $payment)
    {
        $user = $req->user();

        // Ensure this user can act for the vendor that owns the payment
        $this->authorize('update', Vendor::findOrFail($payment->vendor_id));

        if ($payment->status !== 'succeeded') {
            $payment->update(['status' => 'succeeded']);
            // Optional: trigger a “payment received” notification or event here
        }

        return $payment->fresh();
    }
}