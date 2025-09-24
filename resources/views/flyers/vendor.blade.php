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
    .desc { font-size: 28px; line-height: 1.25; margin: 18px 0 10px; text-align: center; }
    .lead { font-size: 12px; margin: 2px 0; }
    .banner { width:100%; max-height: 180px; object-fit: cover; border-radius: 12px; margin-bottom: 14px; }
    .photo { width:168px; height:168px; border-radius: 10px; object-fit: cover; }
    .qr { width:170px; height:170px; }
    table { border-collapse: collapse; width:100%; }
    td { vertical-align: top; }
  </style>
</head>
<body>
  <div class="page">

    {{-- Banner with fallback --}}
    @php
      $bannerFile = $vendor->banner_path
        ? public_path('storage/'.$vendor->banner_path)
        : public_path('images/vendor-banner-default.jpg');
    @endphp
    @if (is_file($bannerFile))
      <img src="{{ $bannerFile }}" alt="Vendor banner" class="banner" />
    @endif

    {{-- Two-column row: left = photo + text, right = QR --}}
    <table>
      <tr>
        <td style="width:62%; padding-right:16px;">
          <table>
            <tr>
              <td style="width:184px;">
                @php
                  $photoFile = $vendor->photo_path
                    ? public_path('storage/'.$vendor->photo_path)
                    : public_path('images/vendor-photo-default.jpg');
                @endphp
                @if (is_file($photoFile))
                  <img src="{{ $photoFile }}" alt="Vendor photo" class="photo" />
                @endif
              </td>
              <td>
                <h1 class="h1">{{ $vendor->name }}</h1>
                @if($vendor->contact_email)
                  <div class="lead muted">{{ $vendor->contact_email }}</div>
                @endif
                @php
                  $digits = preg_replace('/\D+/', '', (string)($vendor->contact_phone ?? ''));
                  $pretty = $digits
                    ? (strlen($digits) === 11 && str_starts_with($digits, '1')
                        ? '(' . substr($digits,1,3) . ') ' . substr($digits,4,3) . '-' . substr($digits,7)
                        : (strlen($digits) === 10
                            ? '(' . substr($digits,0,3) . ') ' . substr($digits,3,3) . '-' . substr($digits,6)
                            : $vendor->contact_phone))
                    : null;
                @endphp
                @if(!empty($pretty))
                  <div class="lead muted">{{ $pretty }}</div>
                @endif

              </td>
            </tr>
          </table>
        </td>

        <td style="width:38%; padding-left:8px; text-align:center;">
          <img src="data:{{ $qrMime }};base64,{{ $qrB64 }}" alt="QR" class="qr" />
          <div style="font-size:10px; color:#6b7280; text-align:center; margin-top:6px;">Scan to see products</div>
          <div style="font-size:10px; color:#6b7280; text-align:center;">{{ $landing }}</div>
        </td>
      </tr>
    </table>

    {{-- Centered blurb: prefer flyer_text then description --}}
    @php
      $blurb = trim((string)($vendor->flyer_text ?: $vendor->description ?: ''));
    @endphp
    @if($blurb !== '')
      <div class="desc">{{ $blurb }}</div>
    @endif

  </div>
</body>
</html>