import { parse, serialize } from 'parse5';

/** Delivery HTML metadata does not alter authored browser modules or inline code. */
export function publicTroyHtml(bytes) {
  const document = parse(bytes.toString());
  const html = document.childNodes.find(node => node.tagName === 'html');
  html.attrs = html.attrs.filter(attr => attr.name !== 'lang');
  html.attrs.push({ name: 'lang', value: 'en' });
  const head = html.childNodes.find(node => node.tagName === 'head');
  head.childNodes = head.childNodes.filter(node => !(node.tagName === 'meta' && node.attrs.some(attr => attr.name === 'name' && attr.value.toLowerCase() === 'robots')));
  head.childNodes.push({ nodeName: 'meta', tagName: 'meta', namespaceURI: html.namespaceURI, attrs: [{ name: 'name', value: 'robots' }, { name: 'content', value: 'noindex, nofollow' }], childNodes: [], parentNode: head });
  function visit(node) {
    if (node.tagName === 'button' && !node.attrs.some(attr => attr.name === 'type')) node.attrs.push({ name: 'type', value: 'button' });
    if (node.tagName === 'canvas' && node.attrs.some(attr => attr.name === 'aria-label') && !node.attrs.some(attr => attr.name === 'role')) node.attrs.push({ name: 'role', value: 'img' });
    if (node.tagName === 'pre' && node.attrs.some(attr => attr.name === 'aria-label') && !node.attrs.some(attr => attr.name === 'role')) node.attrs.push({ name: 'role', value: 'log' });
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(html);
  return Buffer.from(serialize(document));
}
