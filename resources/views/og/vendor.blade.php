<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{ $title }} — {{ $siteName }}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="{{ $siteName }}">
  <meta property="og:title" content="{{ $title }}">
  <meta property="og:description" content="{{ $description }}">
  <meta property="og:url" content="{{ $url }}">
  <meta property="og:image" content="{{ $image }}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{{ $title }}">
  <meta name="twitter:description" content="{{ $description }}">
  <meta name="twitter:image" content="{{ $image }}">
</head>
<body>
  <noscript><a href="{{ $url }}">Continue to {{ $title }}</a></noscript>
  <script>location.replace(@json($url));</script>
</body>
</html>