import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface GeocodingResponse {
  results: {
    latitude: number;
    longitude: number;
    name: string;
  }[];
}
interface WeatherResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
}

export const weatherTool = createTool({
  id: 'get-weather',
  description: '緯度・経度から現在の天気を取得する',
  inputSchema: z.object({
    latitude: z.number().describe('緯度'),
    longitude: z.number().describe('経度'),
    address: z.string().describe('住所テキスト（表示用）'),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    address: z.string(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  execute: async ({ context }) => {
    return await getWeather(context.latitude, context.longitude, context.address);
  },
});

const getWeather = async (latitude: number, longitude: number, address: string) => {

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;

  const response = await fetch(weatherUrl);
  const data = (await response.json()) as WeatherResponse;

  return {
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m,
    conditions: getWeatherCondition(data.current.weather_code),
    address,
    latitude,
    longitude,
  };
};

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: '快晴',
    1: '概ね晴れ',
    2: '晴れ時々曇り',
    3: '曇り',
    45: '霧',
    48: '着氷性の霧',
    51: '弱い霧雨',
    53: 'やや強い霧雨',
    55: '濃い霧雨',
    56: '弱い凍結性霧雨',
    57: '濃い凍結性霧雨',
    61: '小雨',
    63: '雨',
    65: '大雨',
    66: '弱い凍結性雨',
    67: '強い凍結性雨',
    71: '弱い降雪',
    73: 'やや強い降雪',
    75: '大雪',
    77: '雪粒',
    80: 'にわか小雨',
    81: 'にわか雨',
    82: '激しいにわか雨',
    85: 'にわか雪',
    86: '激しいにわか雪',
    95: '雷雨',
    96: '小さな雹を伴う雷雨',
    99: '大きな雹を伴う雷雨',
  };
  return conditions[code] || '不明';
}
