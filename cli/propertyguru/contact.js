import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, CommandExecutionError } from '@jackwener/opencli/errors';

const BASE_URL = 'https://www.propertyguru.com.sg';

function resolveListingUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new ArgumentError('listing id or url is required');
  if (raw.startsWith('https://www.propertyguru.com.sg/listing/')) return raw;
  if (/^\d+$/.test(raw)) return `${BASE_URL}/listing/${raw}`;
  throw new ArgumentError(`Invalid listing id or url: "${raw}". Pass a numeric ID or full propertyguru.sg listing URL.`);
}

cli({
  site: 'propertyguru',
  name: 'contact',
  access: 'read',
  description: 'Extract agent contact details from a listing — name, agency, WhatsApp template, phone availability.',
  domain: 'www.propertyguru.com.sg',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'id', type: 'string', positional: true, required: true, help: 'Listing ID (numeric) or full URL' },
  ],
  columns: ['listingId', 'listingTitle', 'agentName', 'agentMobile', 'ceaLicense', 'hasWhatsapp', 'hasPhone', 'hasEnquiry', 'agentProfileUrl', 'listingUrl'],
  func: async (page, kwargs) => {
    const url = resolveListingUrl(kwargs.id);
    await page.goto(url, { settleMs: 2000 });
    await page.wait(2);

    const data = await page.evaluate(() => {
      try {
        const d = window.__NEXT_DATA__?.props?.pageProps?.pageData?.data;
        if (!d) return { error: 'page did not load' };

        const card = d.contactAgentData?.contactAgentCard;
        const agent = card?.agentInfoProps;
        const actions = card?.contactActions || [];
        const richActions = card?.richContactActions || [];

        // Flatten rich actions to find all contact methods
        const allActions = [];
        for (const act of richActions) {
          if (act.groupLayout?.actions) {
            allActions.push(...act.groupLayout.actions);
          } else {
            allActions.push(act);
          }
        }

        const hasWhatsapp = allActions.some(a => a.type === 'whatsapp');
        const hasPhone = allActions.some(a => a.type === 'revealPhoneNumber' || a.type === 'phoneCall');
        const hasEnquiry = allActions.some(a => a.type === 'sendEnquiry');

        // Get WhatsApp template if available
        const waAction = [...actions, ...allActions].find(a => a.type === 'whatsapp');
        const waTemplate = waAction?.message || null;

        // Listing basic info from the page
        const title = d.descriptionBlockData?.subtitle || '';
        const detailItems = d.detailsData?.metatable?.items || [];
        const priceItem = detailItems.find(i => i.value?.includes('S$'));
        const price = priceItem?.value || '';

        return {
          agentName: agent?.agent?.name || '',
          agentMobile: agent?.agent?.mobile || '',
          ceaLicense: (agent?.agent?.description || '').replace(/<[^>]+>/g, '').trim(),
          agentProfileUrl: agent?.agent?.profileUrl || '',
          hasWhatsapp,
          hasPhone,
          hasEnquiry,
          waTemplate,
          listingTitle: title,
          listingPrice: price,
        };
      } catch (err) {
        return { error: err?.message || 'unknown error' };
      }
    });

    if (data?.error) throw new CommandExecutionError(data.error);

    return [{
      listingId: kwargs.id,
      listingTitle: data.listingTitle || '(see listing)',
      agentName: data.agentName,
      agentMobile: data.agentMobile,
      ceaLicense: data.ceaLicense,
      hasWhatsapp: data.hasWhatsapp,
      hasPhone: data.hasPhone,
      hasEnquiry: data.hasEnquiry,
      agentProfileUrl: data.agentProfileUrl ? `${BASE_URL}${data.agentProfileUrl}` : '',
      listingUrl: url,
    }];
  },
});
