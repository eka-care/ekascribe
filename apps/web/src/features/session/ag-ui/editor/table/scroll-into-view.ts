type Span = { left: number; right: number };

export function scrollOffsetToReveal(cell: Span, band: Span): number {
  if (cell.right - cell.left >= band.right - band.left) return cell.left - band.left;
  if (cell.right > band.right) return cell.right - band.right;
  if (cell.left < band.left) return cell.left - band.left;
  return 0;
}
