import Image from 'next/image';

type Testimonial = {
  quote: string;
  name: string;
  title: string;
  photo: string;
};

const TestimonialCard = ({ testimonial }: { testimonial: Testimonial }) => (
  <article className="bg-secondary border border-border rounded-lg w-full h-[326px] flex flex-col overflow-hidden">
    <div className="flex-1 p-4 relative overflow-hidden">
      <p className="text-base leading-6 text-[#767676] relative z-10">{testimonial.quote}</p>
      <Image
        src="/assets/onboarding-v2/quote.svg"
        alt=""
        width={103}
        height={78}
        aria-hidden
        className="absolute -right-[7px] top-[190px] pointer-events-none select-none"
      />
    </div>
    <div className="border-t border-border p-4 flex items-center gap-2">
      <img
        src={testimonial.photo}
        alt=""
        aria-hidden
        width={48}
        height={48}
        className="size-12 rounded-full object-cover border border-[rgba(209,209,209,1)]"
      />
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p className="text-base leading-6 font-medium text-foreground truncate">
          {testimonial.name}
        </p>
        <p className="text-xs leading-4 text-foreground opacity-60 truncate">{testimonial.title}</p>
      </div>
    </div>
  </article>
);

export default TestimonialCard;
