<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{ $vendor->name }} — Subscription Flyer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --text:#111; --muted:#666; --border:#e5e7eb;
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color:var(--text); }
    .page {
      max-width: 900px;
      margin: 0 auto;
      padding: 24px;
    }
    .banner {
      width: 100%;
      height: 220px;
      border-radius: 12px;
      object-fit: cover;
      background: #f5f5f5;
      display: block;
    }
    .header {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 20px;
      align-items: center;
      margin-top: 16px;
    }
    .title { font-size: 28px; font-weight: 700; margin: 4px 0 8px; }
    .meta { font-size: 14px; color: var(--muted); }
    .photo {
      width: 220px; height: 220px; border-radius: 12px; object-fit: cover; background:#fafafa; border:1px solid var(--border);
      justify-self: end;
    }
    .section { margin-top: 28px; }
    .section h2 { font-size: 18px; margin: 0 0 10px; }
    .grid {
      display: grid; gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    }
    .card {
      border: 1px solid var(--border); border-radius: 12px; padding: 12px;
    }
    .product-name { font-weight: 600; margin-bottom: 4px; }
    .muted { color: var(--muted); font-size: 14px; }
    .qr-row {
      display: grid; grid-template-columns: 180px 1fr; gap: 16px; align-items: center;
      margin-top: 16px; padding: 16px; border:1px dashed var(--border); border-radius: 12px;
    }
    .qr {
      width: 180px; height: 180px; object-fit: contain; background:#fff; border:1px solid var(--border); border-radius: 8px;
    }
    .pill { display:inline-block; padding:2px 8px; border-radius:999px; border:1px solid var(--border); font-size:12px; color:var(--muted); }
    @media print {
      .page { padding: 16px; }
      .no-print { display:none !important; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    {{-- Banner --}}
    @php
      $bannerUrl = null;
      if (!empty($vendor->banner_path)) {
        // If you store in storage/app/public, make sure you ran `php artisan storage:link`
        $bannerUrl = asset('storage/'.$vendor->banner_path);
      }
    @endphp
    @if($bannerUrl)
      <img class="banner" src="{{ $bannerUrl }}" alt="Banner">
    @else
      <div class="banner" aria-label="Banner"></div>
    @endif

    {{-- Header --}}
    <div class="header">
      <div>
        <div class="title">{{ $vendor->name }}</div>
        <div class="meta">
          @if(!empty($vendor->contact_phone))
            <span class="pill">Phone</span> {{ $vendor->contact_phone }}
          @endif
          @if(!empty($vendor->contact_email))
            &nbsp;&nbsp;<span class="pill">Email</span> {{ $vendor->contact_email }}
          @endif
        </div>
        @if(!empty($vendor->description))
          <div class="section" style="margin-top:10px;">
            <div class="muted">{{ $vendor->description }}</div>
          </div>
        @endif
      </div>

      @php
        $photoUrl = null;
        if (!empty($vendor->photo_path)) {
          $photoUrl = asset('storage/'.$vendor->photo_path);
        }
      @endphp
      @if($photoUrl)
        <img class="photo" src="{{ $photoUrl }}" alt="Vendor Photo">
      @else
        <div class="photo" aria-label="Vendor Photo"></div>
      @endif
    </div>

    {{-- QR + CTA --}}
    <div class="section">
      <h2>Subscribe & never miss out</h2>
      <div class="qr-row">
        @if(!empty($qrPngData))
          {{-- If controller passed a base64 PNG buffer --}}
          <img class="qr" src="data:image/png;base64,{{ $qrPngData }}" alt="QR code">
        @elseif(!empty($qrUrl))
          {{-- Or just an URL to /vendors/{id} --}}
          <img class="qr" src="{{ $qrUrl }}" alt="QR code">
        @else
          <div class="qr" aria-label="QR code"></div>
        @endif
        <div>
          <div class="muted">Scan to view this vendor in the app and subscribe to offerings.</div>
          @if(!empty($subscribeMessage))
            <div style="margin-top:8px;">{{ $subscribeMessage }}</div>
          @else
            <div style="margin-top:8px;">
              Never miss your favorites again. Reserve your share and pick up on market day.
            </div>
          @endif
          @if(!empty($deepLink))
            <div class="muted" style="margin-top:8px;">Direct link: {{ $deepLink }}</div>
          @endif
        </div>
      </div>
    </div>

    {{-- Products --}}
    @if(!empty($products) && count($products))
      <div class="section">
        <h2>Available products</h2>
        <div class="grid">
          @foreach($products as $p)
            <div class="card">
              <div class="product-name">{{ $p->name }}</div>
              @if(!empty($p->description))
                <div class="muted">{{ $p->description }}</div>
              @endif
              @php
                $prices = [];
                if ($p->relationLoaded('variants')) {
                  foreach ($p->variants as $v) {
                    $cents = $v->price_cents ?? $v->price ?? null;
                    if (is_numeric($cents)) $prices[] = $cents;
                  }
                }
              @endphp
              @if(count($prices))
                <div style="margin-top:6px;"><strong>
                  ${{ number_format(min($prices)/100, 2) }}+
                </strong></div>
              @endif
            </div>
          @endforeach
        </div>
      </div>
    @endif

    <div class="section no-print" style="text-align:center; margin-top:24px;">
      <button onclick="window.print()" style="padding:8px 14px; border-radius:8px; border:1px solid var(--border); background:#fff;">
        Print flyer
      </button>
    </div>
  </div>
</body>
</html>