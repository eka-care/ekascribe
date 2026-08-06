"""Document-DB client factory.

The legacy access paths construct their clients through these functions.
Postgres is the only backend: both return shims that speak the document-DB
call surface over the shared Postgres engine (see shims.py / conditions.py).
"""

from __future__ import annotations


def get_dynamo_resource():
    from scribe_core.db.shims import PgResource

    return PgResource()


def get_dynamo_client():
    from scribe_core.db.shims import PgClient

    return PgClient()
