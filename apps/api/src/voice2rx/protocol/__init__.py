"""
MedScribeAlliance Protocol Implementation

This package implements the MedScribeAlliance protocol specification v0.1
for voice-to-structured-medical-text conversion.

Structure:
- models: Pydantic models for protocol request/response schemas
- adaptors: Bridge between protocol and existing backend services
- routes: FastAPI routers for protocol endpoints
- services: Protocol-specific business logic
- utils: Helper functions and utilities
"""

__version__ = "0.1.0"
__protocol_version__ = "0.1"
