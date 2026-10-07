export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Content is trusted application markup; escape each interpolated user value. */
export function htmlPage(title: string, content: string, options: ResponseInit = {}): Response {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const headers = new Headers(options.headers);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set(
    'content-security-policy',
    `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
  );
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · Kiln</title>
<style nonce="${nonce}">
:root{font-family:system-ui,sans-serif;color:#292821;background:#f6f4ef;color-scheme:light}
*{box-sizing:border-box}body{margin:0}main{max-width:42rem;margin:8vh auto;padding:1.5rem}
header{display:flex;align-items:baseline;flex-wrap:wrap;gap:.8rem;margin-bottom:2.5rem}header strong{font-size:1.7rem}header a{text-decoration:none;color:inherit}
header span,footer{font-size:.9rem;color:#59594f}h1{font-size:2rem;line-height:1.2;overflow-wrap:anywhere}
p,li{line-height:1.6}section{border:1px solid #d6d3c9;background:#fff;border-radius:.75rem;padding:1.5rem;margin:1.5rem 0}
h2{font-size:1.15rem;margin-top:0}button{font:inherit;font-weight:600;min-height:2.75rem;padding:.65rem 1.2rem;border:0;border-radius:.35rem;background:#3d5139;color:#fff;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #a25c24;outline-offset:4px}a{color:#365231}code{overflow-wrap:anywhere}
article+article{border-top:1px solid #d6d3c9;margin-top:1.5rem;padding-top:1.5rem}article h3,article p{overflow-wrap:anywhere}
article form{display:flex;align-items:center;flex-wrap:wrap;gap:.75rem}select{font:inherit;min-height:2.75rem;border:1px solid #747775;border-radius:.35rem;background:#fff;color:#292821;padding:.4rem}
select:focus-visible{outline:3px solid #a25c24;outline-offset:4px}
.provider-buttons{display:flex;flex-wrap:wrap;gap:.75rem}.google-button{padding:0;background:transparent;line-height:0}
.google-button img{display:block;width:198px;height:44px}.github-button{width:198px;min-height:44px;padding:0;background:#fff;color:#1f1f1f;border:1px solid #747775;font-size:14px;font-weight:500}
.secondary{background:transparent;color:#365231;border:1px solid #747775}.permission-list{padding-left:1.25rem}.client-detail{overflow-wrap:anywhere}
footer{margin-top:2rem}footer nav{display:flex;gap:1rem;flex-wrap:wrap}
</style></head><body><main><header><strong><a href="/">Kiln</a></strong><span>by Instrukt Labs</span></header>
${content}<footer><nav aria-label="Support and policies"><a href="/account">Your account</a><a href="/privacy">Privacy</a><a href="/support">Support</a>
<a href="https://github.com/instruktlabs/kiln">Open source</a></nav></footer></main></body></html>`,
    { ...options, headers },
  );
}
