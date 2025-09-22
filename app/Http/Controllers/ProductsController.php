<?php

namespace App\Http\Controllers;

use App\Models\Product;

class ProductsController extends Controller
{
    public function index()
    {
        return Product::where('active', true)->orderBy('name')->get();
    }
}