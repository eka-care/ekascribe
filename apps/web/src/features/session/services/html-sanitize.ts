
export function isAllowedHref(href: string): boolean {
  return /^https:\/\//i.test(href.trim());
}

function unwrapElement(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

export function sanitizeHtmlForNote(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.querySelectorAll('script, style, noscript, iframe, object, embed').forEach((el) => el.remove());

  doc.querySelectorAll('img').forEach((el) => el.remove());

  doc.querySelectorAll('a[href]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    if (!isAllowedHref(href)) unwrapElement(el);
  });

  doc.querySelectorAll('table').forEach((table) => {
    const firstRow = table.querySelector('tr');
    if (!firstRow || firstRow.querySelector('th')) return;
    firstRow.querySelectorAll('td').forEach((cell) => {
      const th = doc.createElement('th');
      th.innerHTML = cell.innerHTML;
      cell.replaceWith(th);
    });
  });

  return doc.body.innerHTML;
}
