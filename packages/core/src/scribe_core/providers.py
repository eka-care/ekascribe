"""External identity providers — OIDC and plain OAuth2 — config-driven.

``AUTH_PROVIDERS`` is a JSON list; each entry describes one provider. The
provider's ``id`` becomes part of its URLs, so a request landing on
``/oidc/keycloak/callback`` is unambiguous even when several providers are
configured:

    login    /{family}/{id}/login
    callback /{family}/{id}/callback
    logout   /{family}/{id}/logout

where ``family`` is the URL segment for the provider's type: ``oidc`` for
type=oidc, ``oauth`` for type=oauth2 (the config type keeps the precise
protocol name; the URL uses the shorter conventional segment).

Example::

    AUTH_PROVIDERS='[
      {"id": "parichay", "type": "oauth2",
       "display_name": "Parichay",
       "authorization_endpoint": "https://parichay.nic.in/pnv1/oauth2/authorize",
       "token_endpoint": "https://parichay.nic.in/pnv1/oauth2/token",
       "userinfo_endpoint": "https://parichay.nic.in/pnv1/api/userDetails",
       "client_id": "...", "client_secret": "...",
       "scopes": "user_details",
       "claim_username": "email", "claim_name": "fullName"},
      {"id": "keycloak", "type": "oidc",
       "issuer": "https://idp.example.gov.in/realms/vaarta",
       "client_id": "...", "client_secret": "..."}
    ]'

``type`` picks the identity mechanism: ``oidc`` providers return an id_token
which we validate against the IdP's JWKS; ``oauth2`` providers (Parichay
style) return only an access token, so identity comes from a mandatory
``userinfo_endpoint`` call.

``redirect_url`` defaults to ``{SELF_URL}/{family}/{id}/callback`` — override
it only when the public URL differs from SELF_URL. Whatever value is used
must be registered byte-for-byte at the provider.

Back-compat: with AUTH_PROVIDERS unset, the legacy single-provider ``OIDC_*``
env vars are mapped onto one provider with id ``default`` (so its callback is
``/oidc/default/callback`` — re-register that at the IdP).
"""

from __future__ import annotations

import json
from typing import Dict, Literal, Optional, Tuple

from pydantic import BaseModel, Field, field_validator, model_validator

from scribe_core.settings import get_settings


class ProviderError(Exception):
    """AUTH_PROVIDERS is malformed or a provider entry is invalid."""


class UnknownProvider(Exception):
    """No configured provider has the requested id (or the type mismatches)."""


class ProviderConfig(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_-]{0,63}$")
    type: Literal["oidc", "oauth2"]
    display_name: str = "Single sign-on"

    # --- OIDC: where to find the provider's metadata ---
    issuer: Optional[str] = None
    discovery_url: Optional[str] = None  # default: {issuer}/.well-known/openid-configuration

    # --- Manual endpoints (required for oauth2; override discovery for oidc)
    authorization_endpoint: Optional[str] = None
    token_endpoint: Optional[str] = None
    userinfo_endpoint: Optional[str] = None
    end_session_endpoint: Optional[str] = None

    # --- Client registration ---
    client_id: str
    client_secret: Optional[str] = None  # omit for a public client (PKCE only)
    redirect_url: Optional[str] = None   # default derived from SELF_URL
    scopes: Optional[str] = None         # default: openid profile email (oidc)
    # Authlib token_endpoint_auth_method; default: client_secret_post when a
    # secret is configured, else "none" (public client).
    token_auth_method: Optional[
        Literal["client_secret_post", "client_secret_basic", "none"]
    ] = None
    use_pkce: bool = True

    # --- Claim mapping: provider claims -> our users row ---
    claim_uuid: str = "sub"
    claim_username: str = "email"
    claim_name: str = "name"

    # --- Transport ---
    verify_ssl: bool = True
    ca_bundle: Optional[str] = None      # PEM path for a private/gov CA
    request_timeout_s: float = 10.0
    post_logout_redirect: Optional[str] = None

    @field_validator("scopes")
    @classmethod
    def _strip_scopes(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _check_endpoints(self) -> "ProviderConfig":
        if self.type == "oidc":
            if not (self.issuer or self.discovery_url) and not (
                self.authorization_endpoint and self.token_endpoint
            ):
                raise ValueError(
                    f"provider '{self.id}': oidc needs issuer/discovery_url "
                    "(or explicit authorization_endpoint + token_endpoint)"
                )
            if self.scopes is None:
                object.__setattr__(self, "scopes", "openid profile email")
            elif "openid" not in self.scopes.split():
                raise ValueError(
                    f"provider '{self.id}': oidc scopes must include 'openid' "
                    "(without it the IdP will not return an id_token)"
                )
        else:  # oauth2
            missing = [
                n for n in ("authorization_endpoint", "token_endpoint", "userinfo_endpoint")
                if not getattr(self, n)
            ]
            if missing:
                raise ValueError(
                    f"provider '{self.id}': oauth2 requires {', '.join(missing)}"
                )
            if not self.scopes:
                raise ValueError(f"provider '{self.id}': oauth2 requires scopes")
        return self

    # --- URL helpers (single source of truth for the path shape) -------------

    @property
    def family(self) -> str:
        """URL segment for this provider's type: 'oidc' or 'oauth'. The
        config ``type`` stays 'oauth2' (the protocol's real name); only the
        URL uses the shorter segment."""
        return "oidc" if self.type == "oidc" else "oauth"

    @property
    def login_path(self) -> str:
        return f"/{self.family}/{self.id}/login"

    @property
    def callback_path(self) -> str:
        return f"/{self.family}/{self.id}/callback"

    @property
    def logout_path(self) -> str:
        return f"/{self.family}/{self.id}/logout"

    def effective_redirect_url(self) -> str:
        if self.redirect_url:
            return self.redirect_url
        s = get_settings()
        return f"{s.self_url.rstrip('/')}{self.callback_path}"

    def effective_token_auth_method(self) -> str:
        if self.token_auth_method:
            return self.token_auth_method
        return "client_secret_post" if self.client_secret else "none"


# Parsed registry, cached against the raw JSON so a settings reload (tests,
# env changes) invalidates naturally.
_CACHE: Tuple[Optional[str], Dict[str, ProviderConfig]] = (None, {})


def _legacy_provider() -> Optional[ProviderConfig]:
    """Map the old single-provider OIDC_* env vars onto provider id 'default'."""
    s = get_settings()
    if not ((s.oidc_issuer or s.oidc_discovery_url) and s.oidc_client_id):
        return None
    return ProviderConfig(
        id="default",
        type="oidc",
        display_name=s.oidc_display_name,
        issuer=s.oidc_issuer,
        discovery_url=s.oidc_discovery_url,
        client_id=s.oidc_client_id,
        client_secret=s.oidc_client_secret,
        redirect_url=s.oidc_redirect_url,
        scopes=s.oidc_scopes,
        claim_uuid=s.oidc_claim_uuid,
        claim_username=s.oidc_claim_username,
        claim_name=s.oidc_claim_name,
        verify_ssl=s.oidc_verify_ssl,
        ca_bundle=s.oidc_ca_bundle,
        request_timeout_s=s.oidc_request_timeout_s,
        post_logout_redirect=s.oidc_post_logout_redirect,
    )


def get_providers() -> Dict[str, ProviderConfig]:
    """All configured providers, keyed by id (insertion order preserved)."""
    global _CACHE
    s = get_settings()
    raw = s.auth_providers
    if _CACHE[0] == raw and _CACHE[1]:
        return _CACHE[1]

    providers: Dict[str, ProviderConfig] = {}
    if raw:
        try:
            entries = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ProviderError(f"AUTH_PROVIDERS is not valid JSON: {exc}") from exc
        if not isinstance(entries, list):
            raise ProviderError("AUTH_PROVIDERS must be a JSON *list* of providers")
        for entry in entries:
            try:
                p = ProviderConfig.model_validate(entry)
            except Exception as exc:
                raise ProviderError(f"AUTH_PROVIDERS entry invalid: {exc}") from exc
            if p.id in providers:
                raise ProviderError(f"AUTH_PROVIDERS has duplicate id '{p.id}'")
            providers[p.id] = p
    else:
        legacy = _legacy_provider()
        if legacy:
            providers[legacy.id] = legacy

    _CACHE = (raw, providers)
    return providers


def get_provider(provider_id: str, family: Optional[str] = None) -> ProviderConfig:
    """Look up a provider; ``family`` ('oidc'|'oauth') must match the
    provider's URL family so /oauth/... URLs can never drive an oidc provider
    or vice versa."""
    p = get_providers().get(provider_id)
    if p is None:
        raise UnknownProvider(f"no auth provider configured with id '{provider_id}'")
    if family is not None and p.family != family:
        raise UnknownProvider(
            f"provider '{provider_id}' is under /{p.family}/, not /{family}/"
        )
    return p


def default_provider() -> Optional[ProviderConfig]:
    """The provider the login button uses:
    AUTH_DEFAULT_PROVIDER if set, else the first configured provider."""
    providers = get_providers()
    if not providers:
        return None
    s = get_settings()
    if s.auth_default_provider:
        return providers.get(s.auth_default_provider)
    return next(iter(providers.values()))
