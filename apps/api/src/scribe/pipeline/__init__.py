"""On-prem background execution (in-process job runner + dispatch seam).

The scribe pipeline (transcribe_chunk, vad_session, process_session,
finalize_session) is defined once, queue-agnostically, in ``pipeline``.
``dispatch()`` routes each job to either the in-process runner
(EXECUTION_MODE=inprocess, default) or the Postgres/procrastinate worker
(EXECUTION_MODE=worker). apps/worker wraps the same functions in
procrastinate tasks.
"""
