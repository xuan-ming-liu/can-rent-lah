import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';

const BASE_URL = 'https://www.propertyguru.com.sg';

const PROPERTY_TYPES = [
  'hdb',
  'condo',
  'apartment',
  'landed',
  'semi-d',
  'terraced',
  'detached',
  'bungalow',
  'executive-condo',
  'walk-up',
  'studio',
];

function normalizePositiveInteger(value, defaultValue, label) {
  const raw = value ?? defaultValue;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new ArgumentError(`${label} must be a positive integer`);
  return n;
}

cli({
  site: 'propertyguru',
  name: 'search',
  access: 'read',
  description: 'Search Singapore properties for rent on PropertyGuru. Default: rent, sorted by relevance.',
  domain: 'www.propertyguru.com.sg',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'query', type: 'string', positional: true, required: true, help: 'Location to search: district, MRT station, or area name (e.g. "clementi", "jurong west", "paya lebar")' },
    { name: 'listing', type: 'string', default: 'rent', choices: ['rent', 'sale'], help: 'Listing type: rent (default) or sale' },
    { name: 'max', type: 'int', help: 'Maximum monthly rent (SGD)' },
    { name: 'min', type: 'int', help: 'Minimum monthly rent (SGD)' },
    { name: 'bedrooms', type: 'int', help: 'Number of bedrooms' },
    { name: 'type', type: 'string', choices: PROPERTY_TYPES, help: 'Property type: hdb, condo, landed, semi-d, etc.' },
    { name: 'limit', type: 'int', default: 20, help: 'Max results (default 20)' },
  ],
  columns: ['id', 'title', 'price', 'bedrooms', 'bathrooms', 'floorArea', 'propertyType', 'address', 'mrt', 'availability', 'postedDate', 'url'],
  func: async (page, kwargs) => {
    const query = String(kwargs.query ?? '').trim();
    if (!query) throw new ArgumentError('search query (location) is required');

    const limit = normalizePositiveInteger(kwargs.limit, 20, 'limit');
    const listingType = kwargs.listing || 'rent';
    if (!['rent', 'sale'].includes(listingType)) {
      throw new ArgumentError(`listing must be "rent" or "sale", got "${listingType}"`);
    }

    // Build search URL
    const params = new URLSearchParams();
    params.set('freetext', query);
    params.set('market', 'residential');

    if (kwargs.max) {
      const max = normalizePositiveInteger(kwargs.max, null, 'max');
      params.set('maxprice', String(max));
    }
    if (kwargs.min) {
      const min = normalizePositiveInteger(kwargs.min, null, 'min');
      params.set('minprice', String(min));
    }
    if (kwargs.bedrooms) {
      params.set('bedrooms', String(normalizePositiveInteger(kwargs.bedrooms, null, 'bedrooms')));
    }
    if (kwargs.type) {
      const pt = String(kwargs.type).toLowerCase().trim();
      if (!PROPERTY_TYPES.includes(pt)) {
        throw new ArgumentError(`Unknown property type "${pt}". Valid: ${PROPERTY_TYPES.join(', ')}`);
      }
      params.set('property_type_code', pt);
    }

    const path = listingType === 'sale' ? '/property-for-sale' : '/property-for-rent';
    const searchUrl = `${BASE_URL}${path}?${params.toString()}`;

    // Navigate and wait for SSR data
    await page.goto(searchUrl, { settleMs: 2000 });
    await page.wait(2);

    const data = await page.evaluate(() => {
      try {
        const d = window.__NEXT_DATA__;
        if (!d) return { error: 'page did not load properly (no __NEXT_DATA__)' };
        const listingsData = d?.props?.pageProps?.pageData?.data?.listingsData;
        if (!listingsData) return { error: 'could not find listing data on page' };

        const results = [];
        for (const [key, entry] of Object.entries(listingsData)) {
          if (!entry?.listingData) continue;
          const ld = entry.listingData;
          results.push({
            id: ld.id,
            title: ld.localizedTitle || '',
            priceValue: ld.price?.value ?? null,
            priceDisplay: ld.price?.pretty || '',
            bedrooms: ld.bedrooms ?? null,
            bathrooms: ld.bathrooms ?? null,
            floorArea: ld.floorArea ?? null,
            propertyType: ld.listingFeatures?.find?.(f => f?.dataAutomationId === 'listing-card-v2-unit-type')?.text || null,
            address: ld.fullAddress || ld.localizedTitle || '',
            mrt: ld.mrt?.nearbyText || null,
            availability: ld.availabilityInfo || null,
            postedDate: ld.postedOn?.text || null,
            url: ld.url || `${BASE_URL}/listing/${ld.id}`,
            listingType: ld.typeCode || listingType,
            psfText: ld.psfText || null,
          });
        }
        return { results };
      } catch (err) {
        return { error: err?.message || 'unknown error extracting listings' };
      }
    });

    if (data?.error) {
      if (data.error.includes('not log') || data.error.includes('captcha') || data.error.includes('login')) {
        throw new AuthRequiredError('propertyguru.com.sg', data.error);
      }
      throw new CommandExecutionError(data.error);
    }

    const listings = (data?.results || []).slice(0, limit);

    if (listings.length === 0) {
      throw new EmptyResultError('propertyguru search', `No listings found for "${query}". Try broadening the area or relaxing filters.`);
    }

    return listings.map((it) => ({
      id: it.id,
      title: it.title,
      price: it.priceDisplay,
      bedrooms: it.bedrooms,
      bathrooms: it.bathrooms,
      floorArea: it.floorArea,
      propertyType: it.propertyType,
      address: it.address,
      mrt: it.mrt,
      availability: it.availability,
      postedDate: it.postedDate,
      url: it.url,
    }));
  },
});
