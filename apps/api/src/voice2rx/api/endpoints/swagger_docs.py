"""
Swagger Documentation Endpoints

Serves OpenAPI/Swagger documentation for both legacy (v1) and protocol (v2) APIs
"""

import json
import os
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import HTMLResponse, JSONResponse

from logs.custom_logger import get_logger

logger = get_logger(__name__)

swagger_router = APIRouter(tags=["Documentation"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent
OPENAPI_DIR = BASE_DIR / "openapi"

# Log the paths for debugging
logger.info("Swagger docs module loaded")
logger.info(f"BASE_DIR: {BASE_DIR}")
logger.info(f"OPENAPI_DIR: {OPENAPI_DIR}")
logger.info(f"OPENAPI_DIR exists: {OPENAPI_DIR.exists()}")
if OPENAPI_DIR.exists():
    logger.info(f"Files in OPENAPI_DIR: {list(OPENAPI_DIR.iterdir())}")


def load_openapi_spec(version: str) -> dict:
    """Load OpenAPI specification from JSON file and configure for current environment"""
    try:
        spec_file = OPENAPI_DIR / f"{version}_openapi.json"
        logger.info(f"Loading OpenAPI spec from: {spec_file}")
        
        if not spec_file.exists():
            logger.error(f"OpenAPI spec file not found: {spec_file}", severity="low")
            logger.error(f"OPENAPI_DIR: {OPENAPI_DIR}", severity="low")
            logger.error(f"Files in directory: {list(OPENAPI_DIR.iterdir()) if OPENAPI_DIR.exists() else 'Directory does not exist'}", severity="low")
            return {}
            
        with open(spec_file, 'r') as f:
            spec = json.load(f)
        
        environment = os.getenv("ENV", "dev").lower()
        
        if version == "v1":
            if environment == "prod":
                spec["servers"] = [
                    {
                        "url": "https://api.eka.care",
                        "description": "Production server"
                    }
                ]
            else:
                spec["servers"] = [
                    {
                        "url": "https://api.dev.eka.care",
                        "description": "Development server"
                    },
                    {
                        "url": "http://localhost:8000",
                        "description": "Local development server"
                    }
                ]
        else:
            if environment == "prod":
                spec["servers"] = [
                    {
                        "url": "https://api.eka.care/voice/v1",
                        "description": "Production server"
                    }
                ]
            else:
                spec["servers"] = [
                    {
                        "url": "https://api.dev.eka.care/voice/v1",
                        "description": "Development server"
                    },
                    {
                        "url": "http://localhost:8000/voice/v1",
                        "description": "Local development server"
                    }
                ]
        
        logger.info(f"Configured {version} spec for {environment} environment with {len(spec['servers'])} server(s)")
        return spec
        
    except Exception as e:
        logger.error(f"Error loading OpenAPI spec for {version}: {e}", exc_info=True, severity="low")
        return {}


def generate_swagger_html(spec_url: str, title: str) -> str:
    """Generate Swagger UI HTML page with authorization support"""
    return f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{title}</title>
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.5/swagger-ui.css">
        <style>
            body {{
                margin: 0;
                padding: 0;
            }}
            .swagger-ui .topbar {{
                background-color: #2c3e50;
            }}
            .swagger-ui .topbar .download-url-wrapper {{
                display: none;
            }}
            .swagger-ui .info {{
                margin: 20px 0;
            }}
            .swagger-ui .scheme-container {{
                background: #f7f7f7;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }}
            /* Make authorize button more prominent */
            .swagger-ui .btn.authorize {{
                background-color: #49cc90;
                border-color: #49cc90;
            }}
            .swagger-ui .btn.authorize:hover {{
                background-color: #3da876;
                border-color: #3da876;
            }}
            .swagger-ui .btn.authorize svg {{
                fill: white;
            }}
            /* Highlight security requirements */
            .swagger-ui .opblock-security {{
                background-color: #fff3cd;
                padding: 5px 10px;
                border-radius: 3px;
                margin: 10px 0;
            }}
        </style>
    </head>
    <body>
        <div id="swagger-ui"></div>
        <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.5/swagger-ui-bundle.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.10.5/swagger-ui-standalone-preset.js"></script>
        <script>
            window.onload = function() {{
                const ui = SwaggerUIBundle({{
                    url: "{spec_url}",
                    dom_id: '#swagger-ui',
                    deepLinking: true,
                    presets: [
                        SwaggerUIBundle.presets.apis,
                        SwaggerUIStandalonePreset
                    ],
                    plugins: [
                        SwaggerUIBundle.plugins.DownloadUrl
                    ],
                    layout: "StandaloneLayout",
                    persistAuthorization: true,
                    tryItOutEnabled: true,
                    displayRequestDuration: true,
                    filter: true,
                    syntaxHighlight: {{
                        activate: true,
                        theme: "monokai"
                    }},
                    requestInterceptor: (request) => {{
                        // Log requests for debugging
                        console.log('API Request:', request.url);
                        return request;
                    }},
                    responseInterceptor: (response) => {{
                        // Log responses for debugging
                        console.log('API Response:', response.status, response.url);
                        return response;
                    }},
                    onComplete: () => {{
                        console.log('Swagger UI loaded successfully');
                        console.log('Server URL:', ui.getSystem().getState().getIn(['spec', 'json', 'servers', 0, 'url']));
                    }}
                }});
                window.ui = ui;
            }};
        </script>
    </body>
    </html>
    """


@swagger_router.get("/v1/docs", response_class=HTMLResponse, include_in_schema=False)
async def get_v1_docs():
    """
    Swagger UI for Legacy API (v1)
    
    Displays interactive documentation for legacy Voice2Rx endpoints including:
    - Transaction management (init, commit, stop)
    - Status polling and results
    - Template and section management
    - Configuration endpoints
    """
    try:
        html = generate_swagger_html(
            spec_url="/voice/api/v1/openapi.json",
            title="Voice2Rx API - Legacy Endpoints (v1)"
        )
        return HTMLResponse(content=html)
    except Exception as e:
        logger.error(f"Error generating v1 docs: {e}", severity="low")
        return HTMLResponse(content=f"<h1>Error loading documentation</h1><p>{str(e)}</p>", status_code=500)


@swagger_router.get("/v2/docs", response_class=HTMLResponse, include_in_schema=False)
async def get_v2_docs():
    """
    Swagger UI for Protocol API (v2)
    
    Displays interactive documentation for MedScribeAlliance Protocol v0.1 endpoints including:
    - Discovery and capability endpoints
    - Session lifecycle management
    - Audio upload (chunked, single, stream)
    - Template discovery
    """
    try:
        html = generate_swagger_html(
            spec_url="/voice/api/v2/openapi.json",
            title="Voice2Rx Protocol API - MedScribeAlliance v0.1"
        )
        return HTMLResponse(content=html)
    except Exception as e:
        logger.error(f"Error generating v2 docs: {e}", severity="low")
        return HTMLResponse(content=f"<h1>Error loading documentation</h1><p>{str(e)}</p>", status_code=500)


@swagger_router.get("/v1/openapi.json", include_in_schema=False)
async def get_v1_openapi_spec():
    """
    OpenAPI 3.0 specification for Legacy API (v1)
    
    Returns the OpenAPI/Swagger specification in JSON format for legacy endpoints.
    This can be used with any OpenAPI-compatible tool.
    """
    try:
        spec = load_openapi_spec("v1")
        if not spec:
            return JSONResponse(
                content={"error": "OpenAPI specification not found"},
                status_code=404
            )
        return JSONResponse(content=spec)
    except Exception as e:
        logger.error(f"Error loading v1 OpenAPI spec: {e}", severity="low")
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


@swagger_router.get("/v2/openapi.json", include_in_schema=False)
async def get_v2_openapi_spec():
    """
    OpenAPI 3.0 specification for Protocol API (v2)
    
    Returns the OpenAPI/Swagger specification in JSON format for MedScribeAlliance Protocol endpoints.
    This can be used with any OpenAPI-compatible tool.
    """
    try:
        spec = load_openapi_spec("v2")
        if not spec:
            return JSONResponse(
                content={"error": "OpenAPI specification not found"},
                status_code=404
            )
        return JSONResponse(content=spec)
    except Exception as e:
        logger.error(f"Error loading v2 OpenAPI spec: {e}", severity="low")
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )


@swagger_router.get("/docs", response_class=HTMLResponse, include_in_schema=False)
async def get_docs_index():
    """
    Documentation Index
    
    Main landing page for API documentation with links to both v1 (legacy) and v2 (protocol) docs.
    """
    environment = os.getenv("ENV", "dev").lower()
    if environment == "prod":
        base_url = "https://api.eka.care"
        env_display = "Production"
        env_badge_color = "#dc3545"
    else:
        base_url = "https://api.dev.eka.care"
        env_display = "Development"
        env_badge_color = "#28a745"
    
    html = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Voice2Rx API Documentation</title>
        <style>
            * {{
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }}
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 20px;
            }}
            .container {{
                max-width: 900px;
                width: 100%;
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                overflow: hidden;
            }}
            .header {{
                background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
                color: white;
                padding: 40px;
                text-align: center;
                position: relative;
            }}
            .env-badge {{
                position: absolute;
                top: 20px;
                right: 20px;
                background: {env_badge_color};
                color: white;
                padding: 5px 15px;
                border-radius: 20px;
                font-size: 0.85em;
                font-weight: 600;
            }}
            .header h1 {{
                font-size: 2.5em;
                margin-bottom: 10px;
            }}
            .header p {{
                font-size: 1.1em;
                opacity: 0.9;
            }}
            .header .server-info {{
                margin-top: 15px;
                padding: 10px 20px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                font-size: 0.9em;
            }}
            .content {{
                padding: 40px;
            }}
            .auth-info {{
                background: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 20px;
                margin-bottom: 30px;
                border-radius: 5px;
            }}
            .auth-info h3 {{
                color: #856404;
                margin-bottom: 10px;
                font-size: 1.2em;
            }}
            .auth-info p {{
                color: #856404;
                margin: 5px 0;
                font-size: 0.95em;
            }}
            .auth-info code {{
                background: rgba(0, 0, 0, 0.1);
                padding: 2px 8px;
                border-radius: 3px;
                font-family: monospace;
                font-size: 0.9em;
            }}
            .api-section {{
                background: #f8f9fa;
                border-radius: 15px;
                padding: 30px;
                margin-bottom: 20px;
                transition: transform 0.3s, box-shadow 0.3s;
            }}
            .api-section:hover {{
                transform: translateY(-5px);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            }}
            .api-section h2 {{
                color: #2c3e50;
                margin-bottom: 15px;
                font-size: 1.8em;
            }}
            .api-section p {{
                color: #555;
                line-height: 1.6;
                margin-bottom: 20px;
            }}
            .api-section ul {{
                list-style: none;
                margin-bottom: 20px;
            }}
            .api-section ul li {{
                padding: 8px 0;
                color: #666;
            }}
            .api-section ul li:before {{
                content: "✓ ";
                color: #667eea;
                font-weight: bold;
                margin-right: 10px;
            }}
            .btn {{
                display: inline-block;
                padding: 12px 30px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                text-decoration: none;
                border-radius: 25px;
                font-weight: 600;
                transition: transform 0.2s, box-shadow 0.2s;
            }}
            .btn:hover {{
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
            }}
            .badge {{
                display: inline-block;
                padding: 5px 15px;
                background: #667eea;
                color: white;
                border-radius: 20px;
                font-size: 0.85em;
                font-weight: 600;
                margin-left: 10px;
            }}
            .badge.protocol {{
                background: #764ba2;
            }}
            .footer {{
                text-align: center;
                padding: 20px;
                background: #f8f9fa;
                color: #666;
                font-size: 0.9em;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <span class="env-badge">{env_display}</span>
                <h1>🎤 Voice2Rx API Documentation</h1>
                <p>Medical Voice Capture & Structured Data Extraction</p>
                <div class="server-info">
                    📡 Server: <strong>{base_url}</strong>
                </div>
            </div>
            
            <div class="content">
                <div class="auth-info">
                    <h3>🔐 How to Use Authorization</h3>
                    <p>1. Click the <strong>"Authorize"</strong> 🔒 button in Swagger UI</p>
                    <p>2. Enter your JWT token: <code>Bearer your-token-here</code></p>
                    <p>3. Or use API Key: <code>X-API-Key: your-key-here</code> (Protocol API only)</p>
                    <p>4. Click <strong>"Authorize"</strong> and then <strong>"Close"</strong></p>
                    <p>5. Now you can use <strong>"Try it out"</strong> on any endpoint!</p>
                </div>
                
                <div class="api-section">
                    <h2>
                        Legacy API Documentation
                        <span class="badge">v1</span>
                    </h2>
                    <p>
                        Original Voice2Rx API for voice capture, transcription, and medical record extraction.
                        This API provides the transaction-based interface for voice processing.
                    </p>
                    <ul>
                        <li>Transaction lifecycle management (init, commit, stop)</li>
                        <li>Status polling and results retrieval</li>
                        <li>Template and section management</li>
                        <li>Configuration and health check endpoints</li>
                        <li><strong>Authentication: Bearer Token (JWT)</strong></li>
                    </ul>
                    <a href="/voice/api/v1/docs" class="btn">View Legacy API Docs</a>
                    <a href="/voice/api/v1/openapi.json" style="margin-left: 10px; color: #667eea;">Download OpenAPI Spec</a>
                </div>
                
                <div class="api-section">
                    <h2>
                        Protocol API Documentation
                        <span class="badge protocol">v2</span>
                    </h2>
                    <p>
                        MedScribeAlliance Protocol v0.1 implementation providing standardized medical voice capture 
                        and structured data extraction. This API follows industry standards for interoperability.
                    </p>
                    <ul>
                        <li>Discovery and capability endpoints</li>
                        <li>Session-based lifecycle management</li>
                        <li>Multiple audio upload methods (chunked, single, stream)</li>
                        <li>Template discovery and management</li>
                        <li><strong>Authentication: Bearer Token OR API Key</strong></li>
                    </ul>
                    <a href="/voice/api/v2/docs" class="btn">View Protocol API Docs</a>
                    <a href="/voice/api/v2/openapi.json" style="margin-left: 10px; color: #764ba2;">Download OpenAPI Spec</a>
                </div>
            </div>
            
            <div class="footer">
                <p>© 2024 Voice2Rx | Environment: <strong>{env_display}</strong> | Need help? Contact support@voice2rx.com</p>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)
