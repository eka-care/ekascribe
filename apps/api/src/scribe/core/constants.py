
DYNAMO_TEMPLATE_WID_ID_INDEX = "wid-id-index"
DYNAMO_TEMPLATE_SECTION_WID_ID_INDEX = "wid-id-index"


INTEGRATION_TEMPLATE_IDS: list = []

LANGUAGE_MAP = {
    "eng": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "mr": "Marathi",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "as": "Assamese",
}

# Client "flavour" slugs whose sessions self-commit (web/desktop apps).
# NOTE(fe-phase): these are wire values sent by the current frontend build;
# rename together with the frontend rebrand.
exculuded_apps = ["ekascribe-web", "ekascribe-desktop-mac", "ekascribe-desktop-window"]