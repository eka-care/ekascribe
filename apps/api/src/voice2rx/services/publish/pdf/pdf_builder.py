"""Render a Markdown document to a PDF with header/footer images.

Flow: Markdown → HTML (markdown lib) → PDF (WeasyPrint with @page CSS).
Header and footer images are fetched from parchi-supplied URLs and placed via
CSS `@page` margin boxes using the configured heights/margins.
"""

from html import escape
from typing import Any, Dict

from logs.custom_logger import get_logger

logger = get_logger(__name__)


_MARKDOWN_EXTENSIONS = ["extra", "sane_lists", "tables", "nl2br"]


def build_pdf(markdown_text: str, layout: Dict[str, Any]) -> bytes:
    """Return PDF bytes for the given markdown body using the provided layout.

    Args:
        markdown_text: The markdown source.
        layout: Output of `doctor_profile_client.fetch_print_layout`. When None
            or empty (e.g. the parchi lookup failed), the PDF is rendered
            with default margins and no header/footer images.
    """
    # Imports are deferred so consumers that never render PDFs (e.g. unit
    # tests mocking `build_pdf`) don't need WeasyPrint's system libraries.
    import markdown
    from weasyprint import HTML

    body_html = markdown.markdown(markdown_text or "", extensions=_MARKDOWN_EXTENSIONS)
    html_doc = _wrap_html(body_html, layout or {})
    pdf_bytes = HTML(string=html_doc).write_pdf()
    logger.info("PDF generated", size_bytes=len(pdf_bytes), severity="medium")
    return pdf_bytes


def _wrap_html(body_html: str, layout: Dict[str, Any]) -> str:
    page_size = layout.get("page_size") or "A4"
    header_height = layout.get("header_height") or "5cm"
    footer_height = layout.get("footer_height") or "3cm"
    margin_left = layout.get("margin_left") or "1.27cm"
    margin_right = layout.get("margin_right") or "1.27cm"
    header_img = escape(layout.get("header_img") or "")
    footer_img = escape(layout.get("footer_img") or "")

    header_box = (
        f"background-image: url('{header_img}'); "
        "background-repeat: no-repeat; "
        "background-position: center; "
        "background-size: contain;"
    ) if header_img else ""
    footer_box = (
        f"background-image: url('{footer_img}'); "
        "background-repeat: no-repeat; "
        "background-position: center; "
        "background-size: contain;"
    ) if footer_img else ""

    # @page margin boxes: top-center / bottom-center carry the header/footer.
    # Body margins are set so content never overlaps those boxes.
    css = f"""
    @page {{
        size: {page_size};
        margin: {header_height} {margin_right} {footer_height} {margin_left};
        @top-center {{
            content: "";
            width: 100%;
            height: {header_height};
            {header_box}
        }}
        @bottom-center {{
            content: "";
            width: 100%;
            height: {footer_height};
            {footer_box}
        }}
    }}
    body {{
        font-family: "Helvetica", "Arial", sans-serif;
        font-size: 11pt;
        line-height: 1.45;
        color: #111;
    }}
    h1, h2, h3, h4 {{ margin-top: 0.6em; margin-bottom: 0.3em; }}
    table {{ border-collapse: collapse; width: 100%; }}
    th, td {{ border: 1px solid #ccc; padding: 4px 6px; text-align: left; }}
    code, pre {{ font-family: "Courier New", monospace; }}
    pre {{ background: #f5f5f5; padding: 8px; border-radius: 4px; }}
    """

    return (
        "<!DOCTYPE html><html><head>"
        '<meta charset="utf-8"/>'
        f"<style>{css}</style>"
        "</head><body>"
        f"{body_html}"
        "</body></html>"
    )
