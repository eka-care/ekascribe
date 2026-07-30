from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from logs.custom_logger import get_logger
from voice2rx.api.schemas.testimonial import Testimonial

testimonials_router = APIRouter()
logger = get_logger(__name__)

_STATIC_TESTIMONIALS: list[Testimonial] = [
    Testimonial(
        quote=(
            "“EkaScribe has been a game-changer for our practice. It captures "
            "complete consultations accurately, even across English and "
            "regional languages.”"
        ),
        name="Dr. Nemichandra S.C.",
        title="Neurologist · Mysore",
        photo="https://cdn.eka.care/vagus/cmp0szlw600000thy61g1cmtu.png",
    ),
    Testimonial(
        quote=(
            "“I love how quick and effortless EkaScribe makes prescription "
            "writing. No more typing... It honestly feels like I’ve got a "
            "smart assistant sitting beside me.”"
        ),
        name="Dr. Kiran K.K.",
        title="Nephrologist · Mysore",
        photo="https://cdn.eka.care/vagus/cmp0sxiak00010tf06g4n34z8.png",
    ),
    Testimonial(
        quote=(
            "“It’s a complete game-changer. It has cut down my history-taking "
            "and typing time by more than half, which means I finally have "
            "the freedom to focus more on my patients.”"
        ),
        name="Dr. Abhishek Gohel",
        title="Epileptologist · Ahmedabad",
        photo="https://cdn.eka.care/vagus/cmp0sugzb00020tdm1ws72rhl.png",
    ),
]


@testimonials_router.get("")
@testimonials_router.get("/")
async def get_testimonials() -> JSONResponse:
    testimonials = [item.dict() for item in _STATIC_TESTIMONIALS]
    return JSONResponse(
        content={"data": {"testimonials": testimonials}},
        status_code=status.HTTP_200_OK,
    )
