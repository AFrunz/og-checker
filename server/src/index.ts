import { createClient } from 'redis';
import { config } from './config';
import { createApp } from './app';
import type { RedisLike } from './store';

async function main(): Promise<void> {
  const redis = createClient({ url: config.redisUrl });
  redis.on('error', (err: Error) => console.error('[redis]', err.message));
  await redis.connect();

  const app = createApp(redis as unknown as RedisLike);
  app.listen(config.port, () => {
    console.log(`OG Checker server: http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
