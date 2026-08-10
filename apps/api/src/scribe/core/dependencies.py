import orjson
from fastapi import Request, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from typing import Dict

class JwtPayload(BaseModel):
    b_id: str = Field(..., alias="b-id")
    iss: str = Field(...)

    model_config = ConfigDict(extra="ignore")

async def get_validated_jwt_payload(request: Request) -> Dict:
    """
    A FastAPI dependency that extracts, validates, and returns the JWT payload
    from the 'jwt-payload' header.
    """
    jwt_header = request.headers.get("jwt-payload")
    if not jwt_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="jwt-payload header not found."
        )

    try:
        payload_dict = jwt_header
        # only if its is a string
        if isinstance(jwt_header, str):
            payload_dict = orjson.loads(jwt_header)
        JwtPayload.parse_obj(payload_dict)
        return payload_dict
    except orjson.JSONDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON in jwt-payload header."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid jwt-payload: {e}"
        )