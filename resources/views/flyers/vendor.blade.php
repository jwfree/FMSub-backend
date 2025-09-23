<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{ $vendor->name }} — FMSub Flyer</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 24px; }
    .header { display:flex; gap:16px; align-items:center; }
    .brand { flex:1; }
    .banner { width:100%; height:140px; object-fit:cover; border:1px solid #ddd; border-radius:8px; }
    .photo  { width:120px; height:120px; object-fit:cover; border-radius:8px; border:1px solid #ddd; }
    .grid  { margin-top:16px; display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
    .card  { border:1px solid #ddd; border-radius:8px; padding:12px; }
    .muted { color:#666; font-size:12px; }
    .section-title { font-weight:600; margin:20px 0 8px; }
    .qr { text-align:center; margin-top:8px; }
    .qr img { width:160px; height:160px; }
  </style>
</head>
<body>
  @if($vendor->banner_path)
    <img class="banner" src="{{ public_path('storage/'.$vendor->banner_path) }}" alt="Banner">
  @endif

  <div class="header" style="margin-top:12px;">
    @if($vendor->photo_path)
      <img class="photo" src="{{ public_path('storage/'.$vendor->photo_path) }}" alt="Vendor">
    @endif
    <div class="brand">
      <h1 style="margin:0">{{ $vendor->name }}</h1>
      <div class="muted">
        @if($vendor->contact_email) {{ $vendor->contact_email }}<br>@endif
        @if($vendor->contact_phone) {{ $vendor->contact_phone }}@endif
      </div>
      <div class="section-title">Never miss out again!</div>
      <div class="muted">Subscribe to reserve your favorites.</div>
    </div>
    <div class="qr">
      {{-- This is the variable your controller must pass --}}
      <img src="{{ $qrPngUrl }}" alt="QR to vendor page">
      <div class="muted" style="margin-top:6px;">Scan to see products</div>
      <div style="font-size:11px">{{ $landing }}</div>
    </div>
  </div>

  <div class="section-title">Products</div>
  <div class="grid">
    @foreach($products as $p)
      <div class="card">
        <div style="font-weight:600">{{ $p->name }}</div>
        @if($p->description)
          <div class="muted" style="margin-top:4px">{{ $p->description }}</div>
        @endif
        @php
          $min = optional($p->variants)->min('price_cents');
        @endphp
        @if($min)
          <div style="margin-top:6px;">From ${{ number_format($min/100, 2) }}</div>
        @endif
      </div>
    @endforeach
  </div>
</body>
</html>