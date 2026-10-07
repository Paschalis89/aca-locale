import {
  IsString,
  Matches,
} from 'class-validator';

export class ShopifyShopEventDto {
  @IsString()
  @Matches(
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/,
    {
      message:
        'shopifyDomain must be a valid myshopify.com domain.',
    },
  )
  shopifyDomain!: string;
}
