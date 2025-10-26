import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const municipalityTool = createTool({
  id: 'get-municipality',
  description: '曖昧な地点名から緯度・経度・住所情報を取得する',
  inputSchema: z.object({
    location: z.string().describe('住所文字列（例: 東京、東京都、東京都千代田区など）'),
  }),
  outputSchema: z.object({
    latitude: z.number().describe('緯度'),
    longitude: z.number().describe('経度'),
    address: z.string().describe('住所テキスト'),
    addressLevel: z.number().describe('住所レベル（1:都道府県, 2:市区町村, 3:町, 4:丁目, 5:街区, 6:地番, 7:枝番）'),
  }),
  execute: async ({ context }) => {
    return await getMunicipality(context.location);
  },
});

interface NavitimeGeocodingResponse {
  items: Array<{
    coord: { lat: number; lon: number };
    name: string;
    details?: Array<{ level?: number | string }>;
  }>;
}

const getMunicipality = async (
  location: string
): Promise<{ latitude: number; longitude: number; address: string; addressLevel: number }> => {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) {
    throw new Error('RAPIDAPI_KEY environment variable is not set');
  }

  const geocodingUrl = `https://navitime-geocoding.p.rapidapi.com/address/autocomplete?word=${encodeURIComponent(location)}`;
  const geocodingResponse = await fetch(geocodingUrl, {
    headers: {
      'x-rapidapi-host': 'navitime-geocoding.p.rapidapi.com',
      'x-rapidapi-key': rapidApiKey,
    },
  });

  if (!geocodingResponse.ok) {
    throw new Error(`Geocoding API error: ${geocodingResponse.status} ${geocodingResponse.statusText}`);
  }

  const geocodingData = (await geocodingResponse.json()) as NavitimeGeocodingResponse;

  const firstResult = geocodingData.items?.[0];
  if (!firstResult) {
    throw new Error(`Location '${location}' not found`);
  }

  const {
    coord: { lat: latitude, lon: longitude },
    name: address,
  } = firstResult;

  const details = firstResult.details ?? [];
  const lastLevel = details.length > 0 ? details[details.length - 1].level : 1;
  const addressLevel = Number(lastLevel ?? 1) || 1;

  return {
    latitude,
    longitude,
    address,
    addressLevel,
  };
};