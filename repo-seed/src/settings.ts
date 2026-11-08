import { halls } from './halls';
import { persistTogether } from './local-store';
import { pricing, type PricingConfig } from './pricing';

export function savePricing(config: PricingConfig) {
  persistTogether([halls.stageTariffs(config.tariffs.map(t => t.id)), pricing.stage(config)]);
}
