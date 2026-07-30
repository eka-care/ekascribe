import { getPlatform } from '@/platform';

export async function copyMarkdownToClipboard(content: string): Promise<void> {
  if (!content) return;
  await getPlatform().clipboard?.writeText(content);
}
