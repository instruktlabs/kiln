import { parse } from 'parse5';

export const ORIGIN = 'https://kilnstudio.tools';
export function routeForFile(file) {
  const normalized = file.replaceAll('\\', '/');
  return `/${normalized.replace(/(?:^|\/)index\.html$/, '/')}`.replace(/^\/\//, '/');
}
export function resolveInternalLink(href, route) {
  const url = new URL(href, new URL(route, ORIGIN));
  if (url.origin !== ORIGIN) return null;
  return { path: decodeURIComponent(url.pathname), fragment: decodeURIComponent(url.hash.slice(1)) };
}

export function inspectHtml(html) {
  const document = parse(html);
  const elements = [];
  const walk = (node) => {
    if (node.tagName) elements.push(node);
    for (const child of node.childNodes ?? []) walk(child);
    if (node.content) walk(node.content);
  };
  walk(document);
  const attr = (node, name) => node?.attrs?.find((entry) => entry.name === name)?.value;
  const content = (node) => node?.nodeName === '#text' ? node.value : (node?.childNodes ?? []).map(content).join('');
  const named = (tag, attribute, value) => elements.find((node) => node.tagName === tag && attr(node, attribute) === value);
  const meta = (name) => attr(named('meta', 'name', name) ?? named('meta', 'property', name), 'content');
  const references = [];
  for (const node of elements) {
    for (const attribute of ['href', 'src', 'poster']) {
      const url = attr(node, attribute);
      if (url !== undefined) references.push({ url, tag: node.tagName, attribute });
    }
    for (const item of (attr(node, 'srcset') ?? '').split(',')) {
      const url = item.trim().split(/\s+/)[0];
      if (url) references.push({ url, tag: node.tagName, attribute: 'srcset' });
    }
  }
  const ids = elements.flatMap((node) => attr(node, 'id') ? [attr(node, 'id')] : []);
  return {
    title: content(elements.find((node) => node.tagName === 'title')).trim(),
    description: meta('description'),
    language: attr(elements.find((node) => node.tagName === 'html'), 'lang'),
    h1Count: elements.filter((node) => node.tagName === 'h1').length,
    canonical: attr(named('link', 'rel', 'canonical'), 'href'),
    noindex: /(?:^|[,\s])noindex(?:$|[,\s])/.test(meta('robots') ?? ''),
    og: Object.fromEntries(['title', 'description', 'url', 'image', 'image:width', 'image:height'].map((name) => [name, meta(`og:${name}`)])),
    twitter: Object.fromEntries(['card', 'title', 'description', 'image'].map((name) => [name, meta(`twitter:${name}`)])),
    ids, references,
  };
}
