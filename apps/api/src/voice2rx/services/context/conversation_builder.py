"""
Shared builders that turn a transcript + ResolvedContext into an echo
ConversationContext.

Used by both the convert-to-template flow (TemplateGenerationAgent) and the
AG-UI scribe run flow (AgUiRunService). Kept here, next to ResolvedContext /
ContextItemKind, so neither caller has to reach into the other's module.
"""

from typing import Optional

from echo.models.user_conversation import (
    ConversationContext,
    ContentSourceType,
    DocumentContent,
    ImageContent,
    Message,
    MessageRole,
    TextMessage,
)

from voice2rx.services.context.models import ContextItemKind, ResolvedContext


def user_message(*content) -> Message:
    """USER-role message wrapping one or more content blocks."""
    return Message(role=MessageRole.USER, content=list(content))


def item_message(label: str, name: str, item) -> Message:
    """Render a context document/attachment as a USER message.

    PDFs and images become multimodal blocks (URL preferred, base64 fallback);
    everything else is inlined as text.
    """
    url = getattr(item, "url", None)

    if item.kind == ContextItemKind.PDF:
        if url:
            document = DocumentContent(
                source_type=ContentSourceType.URL,
                url=url,
                name=name,
            )
        else:
            document = DocumentContent(
                source_type=ContentSourceType.BASE64,
                data=item.data_base64,
                name=name,
            )
        return user_message(
            TextMessage(text=f"{label} (PDF): {name}"),
            document,
        )

    if item.kind == ContextItemKind.IMAGE:
        if url:
            image = ImageContent(
                media_type=item.media_type,
                source_type=ContentSourceType.URL,
                url=url,
            )
        else:
            image = ImageContent(
                media_type=item.media_type,
                source_type=ContentSourceType.BASE64,
                data=item.data_base64,
            )
        return user_message(
            TextMessage(text=f"{label} (image): {name}"),
            image,
        )

    return user_message(
        TextMessage(text=f"{label}: {name}\n{item.text or ''}")
    )


def build_conversation_context(
    transcript: str,
    resolved_context: Optional[ResolvedContext] = None,
) -> ConversationContext:
    """Seed a ConversationContext with the transcript + resolved context."""
    ctx = ConversationContext()
    has_context = bool(resolved_context) and not resolved_context.is_empty()

    if has_context:
        ctx.add_message(
            user_message(
                TextMessage(text="below one is current session transcript")
            )
        )

    ctx.add_message(user_message(TextMessage(text=transcript)))

    if not has_context:
        return ctx

    ctx.add_message(
        user_message(
            TextMessage(
                text="below attached texts, documents or images are past histories of patient"
            )
        )
    )

    for ps in resolved_context.past_sessions:
        ctx.add_message(
            user_message(
                TextMessage(
                    text=f"Past session transcript ({ps.session_date}):\n{ps.transcript}"
                )
            )
        )

    for doc in resolved_context.documents:
        ctx.add_message(item_message("Context document", doc.document_name, doc))

    for att in resolved_context.attachments:
        ctx.add_message(item_message("Context attachment", att.filename, att))

    return ctx
