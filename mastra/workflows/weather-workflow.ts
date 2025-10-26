import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string(),
});

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
    61: '小雨',
    63: '雨',
    65: '大雨',
    71: '弱い降雪',
    73: 'やや強い降雪',
    75: '大雪',
    95: '雷雨',
  };
  return conditions[code] || '不明';
}

const fetchWeather = createStep({
  id: 'fetch-weather',
  description: '指定した都市の天気予報を取得する',
  inputSchema: z.object({
    city: z.string().describe('天気を取得する対象の都市名'),
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error('Input data not found');
    }

    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(inputData.city)}&count=1`;
    const geocodingResponse = await fetch(geocodingUrl);
    const geocodingData = (await geocodingResponse.json()) as {
      results: { latitude: number; longitude: number; name: string }[];
    };

    if (!geocodingData.results?.[0]) {
      throw new Error(`Location '${inputData.city}' not found`);
    }

    const { latitude, longitude, name } = geocodingData.results[0];

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;
    const response = await fetch(weatherUrl);
    const data = (await response.json()) as {
      current: {
        time: string;
        precipitation: number;
        weathercode: number;
      };
      hourly: {
        precipitation_probability: number[];
        temperature_2m: number[];
      };
    };

    const forecast = {
      date: new Date().toISOString(),
      maxTemp: Math.max(...data.hourly.temperature_2m),
      minTemp: Math.min(...data.hourly.temperature_2m),
      condition: getWeatherCondition(data.current.weathercode),
      precipitationChance: data.hourly.precipitation_probability.reduce(
        (acc, curr) => Math.max(acc, curr),
        0,
      ),
      location: name,
    };

    return forecast;
  },
});

const planActivities = createStep({
  id: 'plan-activities',
  description: '天候に基づいて活動を提案する',
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const forecast = inputData;

    if (!forecast) {
      throw new Error('Forecast data not found');
    }

    const agent = mastra?.getAgent('weatherAgent');
    if (!agent) {
      throw new Error('Weather agent not found');
    }

    const prompt = `以下は ${forecast.location} の天気予報に基づく活動提案の依頼です。次の予報データを参考に、適切な活動を提案してください：
      ${JSON.stringify(forecast, null, 2)}

      各日について、応答は必ず次の形式で正確に構成してください：

      📅 [曜日, 月 日, 年]
      ═══════════════════════════

      🌡️ 天気の要約
      • 天候: [簡潔な説明]
      • 気温: [最低 / 最高 または 範囲（例：X°C to Y°C）]
      • 降水確率: [X%]

      🌅 朝の活動
      屋外：
      • [活動名] - [具体的な場所やルートを含む短い説明]
        推奨時間帯: [具体的な時間帯]
        注意点: [天候に関する注意事項]

      🌞 午後の活動
      屋外：
      • [活動名] - [具体的な場所やルートを含む短い説明]
        推奨時間帯: [具体的な時間帯]
        注意点: [天候に関する注意事項]

      🏠 屋内の代替案
      • [活動名] - [具体的な施設名を含む短い説明]
        適用条件: [どのような天候でこの代替が推奨されるか]

      ⚠️ 注意事項
      • [関連する気象警報、UV指数、風の状況など]

      ガイドライン：
      - 日ごとに屋外活動を2〜3件、時間帯を明記して提案すること
      - 屋内のバックアップ案を1〜2件含めること
      - 降水確率が50%以上の場合は屋内案を優先的に提示すること
      - すべての活動は指定された場所に固有のものであること（具体的な施設、トレイル、場所を含める）
      - 気温に応じて活動の強度を考慮すること
      - 説明は簡潔だが必要な情報を含めること

      表示の一貫性を保つため、絵文字とセクションヘッダーは必ず上記の形式で使用してください。`;

    const response = await agent.stream([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    let activitiesText = '';

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }

    return {
      activities: activitiesText,
    };
  },
});

const weatherWorkflow = createWorkflow({
  id: 'weather-workflow',
  inputSchema: z.object({
    city: z.string().describe('The city to get the weather for'),
  }),
  outputSchema: z.object({
    activities: z.string(),
  }),
})
  .then(fetchWeather)
  .then(planActivities);

weatherWorkflow.commit();

export { weatherWorkflow };
