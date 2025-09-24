{{-- resources/views/flyers/vendor.blade.php --}}
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Vendor flyer</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: DejaVu Sans, Arial, sans-serif; color:#111; }
    .page { padding: 26px 28px; }
    .muted { color:#6b7280; }
    .h1 { font-size: 28px; font-weight: 700; line-height: 1.2; margin: 0; }
    .desc { font-size: 28px; line-height: 1.25; margin: 18px 0 10px; }
    .lead { font-size: 12px; margin: 2px 0; }
    .banner {
      width:100%;
      max-height: 180px;
      height: 180px;            /* fixed box; image will be cropped */
      object-fit: cover;
      object-position: center center;
      border-radius: 12px;
      margin-bottom: 14px;
      display:block;
    }
    .photo {
      width:168px; height:168px;
      border-radius: 10px;
      object-fit: cover;
      object-position:center;
      display:block;
    }
    .qr {
      width:170px; height:170px;   /* square box; QR is base64 so exact fit */
      display:block;
      margin: 0 auto;
    }
    table { border-collapse: collapse; width:100%; }
    td { vertical-align: top; }
  </style>
</head>
<body>
  <div class="page">
    @php
      // Helper to embed a local file as base64 data URI
      function embed_local_base64($path, $fallbackMime = 'image/jpeg') {
          if (is_file($path)) {
              $bin = @file_get_contents($path);
              if ($bin !== false) {
                  $mime = @mime_content_type($path) ?: $fallbackMime;
                  return 'data:' . $mime . ';base64,' . base64_encode($bin);
              }
          }
          return null;
      }

      // Build banner src:
      // 1) If controller gave base64 => use that
      // 2) else use default image from public/images
      $bannerSrc = null;
      if (!empty($bannerB64) && !empty($bannerMime)) {
          $bannerSrc = "data:{$bannerMime};base64,{$bannerB64}";
      } else {
          $bannerSrc = embed_local_base64(public_path('images/vendor-banner-default.jpg'));
      }

      // Build photo src (same approach)
      $photoSrc = null;
      if (!empty($photoB64) && !empty($photoMime)) {
          $photoSrc = "data:{$photoMime};base64,{$photoB64}";
      } else {
          $photoSrc = embed_local_base64(public_path('images/vendor-photo-default.jpg'));
      }

      // QR from controller (base64 inline, always provided)
      $qrSrc = "data:{$qrMime};base64,{$qrB64}";
    @endphp

    {{-- Banner --}}
    @if($bannerSrc)
      <img src="{{ $bannerSrc }}" alt="Vendor banner" class="banner" />
    @endif

    {{-- Two-column row: left = photo + text, right = QR --}}
    <table>
      <tr>
        <td style="width:62%; padding-right:16px;">
          <table>
            <tr>
              <td style="width:188px; padding-right:12px;">
                  @if($photoSrc)
                  <img src="{{ $photoSrc }}" alt="Vendor photo" class="photo" />
                @endif
              </td>
              <td>
                <h1 class="h1">{{ $vendor->name }}</h1>
                @if($vendor->contact_email)
                  <div class="lead muted">{{ $vendor->contact_email }}</div>
                @endif
                @if(!empty($prettyPhone))
                  <div class="lead muted">{{ $prettyPhone }}</div>
                @endif

                <div style="margin-top:16px;">
                  <div style="font-weight:700;">Never miss out again!</div>
                  <div class="lead muted">Subscribe to reserve your favorites.</div>
                </div>
              </td>
            </tr>
          </table>
        </td>

        <td style="width:38%; padding-left:8px; text-align:center;">
          <img src="{{ $qrSrc }}" alt="QR code" class="qr" />
          <div style="font-size:10px; color:#6b7280; text-align:center; margin-top:6px;">Scan to see vendor page</div>
          <div style="font-size:10px; color:#6b7280; text-align:center;">{{ $landing }}</div>
        </td>
      </tr>
    </table>

    {{-- Description (same size as name) --}}
    @if(($vendor->description ?? '') !== '')
      <div class="desc">{{ $vendor->description }}</div>
    @endif

  </div>
</body>
</html>