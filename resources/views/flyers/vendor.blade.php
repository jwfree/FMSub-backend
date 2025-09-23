<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{ $vendor->name }} — Subscription Flyer</title>
  <style>
    @page { margin: 36pt; }
    body { font-family: DejaVu Sans, Helvetica, Arial, sans-serif; color:#111; font-size:12pt; }
    .header { display:flex; gap:16pt; align-items:center; margin-bottom:16pt; }
    .brand { flex:1; }
    .vendor-name { font-size:20pt; font-weight:700; margin:0; }
    .contact { margin:4pt 0 0; font-size:10pt; color:#444; }
    .banner { width:100%; height:140pt; object-fit:cover; border:1pt solid #ddd; border-radius:6pt; margin-bottom:10pt; }
    .photo { width:80pt; height:80pt; object-fit:cover; border-radius:6pt; border:1pt solid #ddd; }
    .section-title { font-size:14pt; font-weight:700; margin:14pt 0 8pt; }
    .products { width:100%; border-collapse:collapse; }
    .products th, .products td { border:1pt solid #ddd; padding:6pt; vertical-align:top; }
    .products th { background:#f5f5f5; text-align:left; }
    .muted { color:#666; font-size:9.5pt; }
    .qrbox { text-align:center; border:1pt dashed #aaa; padding:8pt; border-radius:6pt; }
    .foot { margin-top:12pt; font-size:9.5pt; color:#555; }
    .pill { display:inline-block; padding:2pt 6pt; border:1pt solid #ddd; border-radius:999pt; font-size:9.5pt; }
  </style>
</head>
<body>

  {{-- Optional banner --}}
  @if($vendor->banner_path)
    <img class="banner" src="{{ public_path('storage/'. $vendor->banner_path) }}" alt="Banner">
  @endif

  <div class="header">
    @if($vendor->photo_path)
      <img class="photo" src="{{ public_path('storage/'. $vendor->photo_path) }}" alt="Vendor Photo">
    @endif
    <div class="brand">
      <h1 class="vendor-name">{{ $vendor->name }}</h1>
      <div class="contact">
        @if(!empty($vendor->contact_phone))
          <span>📞 {{ $vendor->contact_phone }}</span>
        @endif
        @if(!empty($vendor->contact_email))
          <span style="margin-left:8pt;">✉️ {{ $vendor->contact_email }}</span>
        @endif
      </div>
      <p class="muted" style="margin-top:8pt;">
        Never miss out again — subscribe to reserve your favorites in advance.
      </p>
    </div>

    {{-- QR to vendor landing --}}
    <div class="qrbox" style="width:140pt;">
      <div style="font-weight:700; margin-bottom:6pt;">Scan to subscribe</div>
      {{-- We render the QR via a URL (controller builds it) --}}
      <img src="{{ $qrDataUri }}" alt="QR code" style="width:180px;height:180px;" />
      <div class="muted" style="margin-top:6pt; word-break:break-all;">{{ $landing }}</div>
    </div>
  </div>

  <div class="section-title">Available Products</div>

  <table class="products">
    <thead>
      <tr>
        <th style="width:35%;">Product</th>
        <th>Description</th>
        <th style="width:25%;">Options</th>
      </tr>
    </thead>
    <tbody>
      @forelse($products as $p)
        <tr>
          <td>
            <div style="font-weight:700;">{{ $p->name }}</div>
            @if(method_exists($p, 'unit') && $p->unit)
              <div class="pill">{{ $p->unit }}</div>
            @endif
          </td>
          <td>
            @if(!empty($p->description))
              {{ $p->description }}
            @else
              <span class="muted">No description provided.</span>
            @endif
          </td>
          <td>
            @if($p->variants && count($p->variants))
              <ul style="margin:0; padding-left:14pt;">
                @foreach($p->variants as $v)
                  <li>
                    {{ $v->name }}
                    @if(isset($v->price_cents))
                      — ${{ number_format($v->price_cents/100, 2) }}
                    @endif
                  </li>
                @endforeach
              </ul>
            @else
              <span class="muted">No options</span>
            @endif
          </td>
        </tr>
      @empty
        <tr>
          <td colspan="3" class="muted">No active products.</td>
        </tr>
      @endforelse
    </tbody>
  </table>

  <p class="foot">
    Tip: Scan the QR to subscribe now. You’ll get reminders before pickup day.
  </p>

</body>
</html>