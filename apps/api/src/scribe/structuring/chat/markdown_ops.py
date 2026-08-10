import re
from dataclasses import dataclass, field
from typing import List, Optional

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")


def _normalize(title: str) -> str:
    """Comparison key for heading text — trimmed, lowercased, ``#``-stripped."""
    return title.strip().lstrip("#").strip().lower()


@dataclass
class _Section:
    level: int
    title: str
    body_lines: List[str] = field(default_factory=list)

    def render(self) -> str:
        heading = f"{'#' * self.level} {self.title.strip()}"
        body = "\n".join(self.body_lines).strip()
        return f"{heading}\n{body}" if body else heading


class MarkdownDocument:
    """Parse markdown into heading-delimited sections and edit them by title."""

    def __init__(self, markdown: str) -> None:
        self._preamble: List[str] = []
        self._sections: List[_Section] = []
        self._parse(markdown or "")

    # ── parsing / rendering ────────────────────────────────────────────

    def _parse(self, markdown: str) -> None:
        current: Optional[_Section] = None
        for line in markdown.splitlines():
            m = _HEADING_RE.match(line)
            if m:
                current = _Section(level=len(m.group(1)), title=m.group(2))
                self._sections.append(current)
            elif current is None:
                self._preamble.append(line)
            else:
                current.body_lines.append(line)

    def to_markdown(self) -> str:
        blocks: List[str] = []
        preamble = "\n".join(self._preamble).strip()
        if preamble:
            blocks.append(preamble)
        blocks.extend(section.render() for section in self._sections)
        return "\n\n".join(blocks).strip()

    # ── queries ────────────────────────────────────────────────────────

    def headings(self) -> List[str]:
        return [s.title.strip() for s in self._sections]

    def _index_of(self, title: str) -> Optional[int]:
        target = _normalize(title)
        for i, s in enumerate(self._sections):
            if _normalize(s.title) == target:
                return i
        return None

    def _default_level(self) -> int:
        return self._sections[0].level if self._sections else 3

    # ── edits ──────────────────────────────────────────────────────────

    def replace_section(self, title: str, body_markdown: str) -> bool:
        """Replace the body of the section titled ``title``. Returns False
        if no such section exists (heading is preserved, body swapped)."""
        idx = self._index_of(title)
        if idx is None:
            return False
        self._sections[idx].body_lines = (body_markdown or "").strip().splitlines()
        return True

    def add_section(
        self,
        title: str,
        body_markdown: str,
        after_title: Optional[str] = None,
    ) -> None:
        """Insert a new section. Placed after the section titled
        ``after_title`` when given and found, otherwise appended."""
        section = _Section(
            level=self._default_level(),
            title=title.strip(),
            body_lines=(body_markdown or "").strip().splitlines(),
        )
        if after_title:
            idx = self._index_of(after_title)
            if idx is not None:
                self._sections.insert(idx + 1, section)
                return
        self._sections.append(section)

    def remove_section(self, title: str) -> bool:
        """Remove the section titled ``title``. Returns False if absent."""
        idx = self._index_of(title)
        if idx is None:
            return False
        del self._sections[idx]
        return True
