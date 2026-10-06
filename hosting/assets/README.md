# Sign-in branding

`src/google-button.ts` embeds an unmodified Google-provided PNG so sign-in pages
need no third-party image, font or script request. It is not a Kiln-owned logo.
Google's brand restrictions continue to apply; the repository's MIT license does
not grant rights to Google's trademarks.

- Guidance: https://developers.google.com/identity/branding-guidelines
- Downloaded 6 October 2026: https://developers.google.com/static/identity/images/signin-assets.zip
- ZIP member: `Android + Web/PNG @2x/Light/Theme=Light, Show text=Yes, Shape=Square, Platform=Android+Web@2x.png`
- Original: 360 × 80 pixels, 6,007 bytes.
- SHA-256: `fdd355abc194d6acc0837c9b5e8a3170d6ae07dfeb85a63d3eb4b7fbfc2bb63f`.

The button preserves the image's aspect ratio. Its accessible name matches the
rendered text. GitHub's adjacent button has the same size and visual weight.
No Google Identity Services script is necessary for the server-side OIDC flow.
