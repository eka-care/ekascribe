"""Backend selection for the document DB (plan B2): DB_BACKEND=postgres|dynamodb.

The four legacy access paths construct their clients through these functions
instead of calling boto3 directly. Dynamo stays fully supported (endpoint
override ⇒ LocalStack works too).
"""

from __future__ import annotations

from scribe_core.settings import get_settings


def get_dynamo_resource():
    s = get_settings()
    if s.db_backend == "postgres":
        from scribe_core.db.shims import PgResource

        return PgResource()
    import boto3

    return boto3.resource(
        "dynamodb", region_name=s.aws_region, endpoint_url=s.dynamodb_endpoint_url
    )


def get_dynamo_client():
    s = get_settings()
    if s.db_backend == "postgres":
        from scribe_core.db.shims import PgClient
        return PgClient()
        
    import boto3
    return boto3.client(
        "dynamodb", region_name=s.aws_region, endpoint_url=s.dynamodb_endpoint_url
    )
