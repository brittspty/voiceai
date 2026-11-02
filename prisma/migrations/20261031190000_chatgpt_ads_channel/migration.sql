-- ChatGPT Ads rows use the shared daily channel table.

ALTER TYPE "ChannelDailyKind" ADD VALUE IF NOT EXISTS 'chatgpt_ads';
