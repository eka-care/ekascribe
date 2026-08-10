from typing import List

from pydantic import BaseModel

class Testimonial(BaseModel):
    quote: str
    name: str
    title: str
    photo: str

class TestimonialsData(BaseModel):
    testimonials: List[Testimonial]

class TestimonialsResponse(BaseModel):
    data: TestimonialsData
