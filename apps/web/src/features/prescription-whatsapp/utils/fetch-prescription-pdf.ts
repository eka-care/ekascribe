export async function fetchPdfBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`PDF fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.arrayBuffer();
}
