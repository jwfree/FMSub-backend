<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>{{ $vendor->name }} – Subscribe</title>
  <style>
    body { font-family: DejaVu Sans, sans-serif; margin: 24px; }
    .h1 { font-size: 28px; font-weight: 700; }
    .muted { color:#666; }
    .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .card { border:1px solid #ddd; border-radius:8px; padding:12px; margin:8px 0; }
    .tag { font-size: 12px; background:#eee; border-radius: 999px; padding: 2px 8px; margin-left: 6px; }
    img.banner { width:100%; height:140px; object-fit:cover; border-radius:8px; margin:8px 0; }
    img.photo { width:84px; height:84px; object-fit:cover; border-radius:50%; border:1px solid #ddd; }
    .qr { width:200px; height:200px; }
  </style>
</head>
<body>
  <div class="grid">
    <div>
      <div class="h1">{{ $vendor->name }}</div>
      <div class="muted">
        @if($vendor->contact_email) {{ $vendor->contact_email }} @endif
        @if($vendor->contact_phone) • {{ $vendor->contact_phone }} @endif
      </div>
      @if($vendor->banner_url)
        <img class="banner" src="{{ $vendor->banner_url }}" alt="Banner">
      @endif
      <p><strong>Never miss out again!</strong> Subscribe and reserve your favorites:
        @foreach($products as $p)
          <span class="tag">{{ $p->name }}</span>
        @endforeach
      </p>
      <div>
        @foreach($products as $p)
          <div class="card">
            <div><strong>{{ $p->name }}</strong></div>
            @if($p->description)<div class="muted">{{ $p->description }}</div>@endif
          </div>
        @endforeach
      </div>
    </div>
    <div>
      @if($vendor->photo_url)
        <img class="photo" src="{{ $vendor->photo_url }}" alt="Photo">
      @endif
      <div style="margin-top:16px">Scan to subscribe:</div>
      <img class="qr" src="{{ $qrPngUrl }}" alt="QR">
      <div class="muted" style="margin-top:8px; word-break:break-all">{{ $landing }}</div>
    </div>
  </div>
</body>
</html>