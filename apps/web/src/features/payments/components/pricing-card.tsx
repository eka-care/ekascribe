import PricingCardCircleCheckIcon from '@/assets/pricing-card-circle-check-icon';
import { TPricingCardProps } from '@/constants/types';
import { Card, CardHeader, CardContent, Button } from '@ui/src';
import { Badge } from '@ui/src';
import { ChevronRight, Mail, Plus } from 'lucide-react';

const PricingCard = ({
  card,
  billingCycle,
  setBillingCycle: _setBillingCycle,
  showPricing,
  yearlyDiscount,
}: {
  card: TPricingCardProps;
  billingCycle: 'monthly' | 'yearly';
  setBillingCycle: (cycle: 'monthly' | 'yearly') => void;
  showPricing: boolean;
  yearlyDiscount: number;
}) => {
  return (
    <Card key={card.id} className={`${card.cardClassName} w-72 md:w-full`} style={card.cardStyle}>
      <CardHeader className="px-3 flex flex-col justify-center items-center text-center space-y-3">
        {card.isPopular && (
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
            <Badge className="rounded-full text-sm">{card.badge}</Badge>
          </div>
        )}
        {card.badge && !card.isPopular && (
          <Badge className="rounded-full" variant={card.badgeVariant}>
            {card.badge}
          </Badge>
        )}

        <p className="text-2xl md:text-3xl font-bold">{card.name}</p>

        {/* Price section for Pro plan */}
        {card.price && showPricing && (
          <div className="text-center">
            <div className="text-3xl font-bold">
              {billingCycle === 'monthly' ? card.price.monthly.price : card.price.yearly.price}
            </div>
            <div className="text-muted-foreground text-sm">
              per {billingCycle === 'monthly' ? 'month' : 'year'}
            </div>
            {billingCycle === 'yearly' && (
              <Badge className="bg-green-10 rounded-full text-xs">
                Save {yearlyDiscount}% with annual billing
              </Badge>
            )}
          </div>
        )}

        <p className="text-sm md:text-base text-secondary-foreground">{card.description}</p>

        <Button
          className="w-full font-medium py-5 cursor-pointer"
          onClick={card.buttonAction || undefined}
          variant={card.buttonVariant}
          disabled={card.buttonDisabled}
        >
          {card.buttonText}
          {card.id === 'pro' && <ChevronRight />}
          {card.id === 'enterprise' && <Mail className="w-3 h-3" />}
        </Button>
      </CardHeader>

      <CardContent className="px-3 space-y-1 md:space-y-2">
        {card.id === 'pro' && (
          <div className="flex items-center space-x-2 md:space-x-3">
            <div className="rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0 p-1 w-5 h-5">
              <Plus className="w-3 h-3 text-blue-600" />
            </div>

            <span className="text-xs md:text-sm font-medium">Includes everything in Free</span>
          </div>
        )}
        {card.features.map((feature, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="flex items-center space-x-2 md:space-x-3">
              <PricingCardCircleCheckIcon iconSize={5} />
              <span
                className={`text-xs md:text-sm ${
                  index === 0 && card.id != 'pro' ? 'font-medium' : ''
                }`}
              >
                {feature.label}
              </span>
            </div>

            {feature.subfeatures &&
              feature.subfeatures.map((subfeature, index) => (
                <div key={index} className="pl-6 flex items-center space-x-2">
                  <PricingCardCircleCheckIcon iconSize={4} />
                  <span className="text-[10px] md:text-xs">{subfeature}</span>
                </div>
              ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default PricingCard;
