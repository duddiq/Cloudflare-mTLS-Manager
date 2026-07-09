import { drizzle } from 'drizzle-orm/d1';
import { checkAndSendExpiryNotifications } from '../../functions/api/utils/notificationService';

export interface Env {
  DB: D1Database;
  ENCRYPTION_SECRET?: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Cron-Worker: Scheduled event triggered at ${new Date().toISOString()}`);
    const db = drizzle(env.DB);

    try {
      const res = await checkAndSendExpiryNotifications(db, env);
      console.log(
        `Cron-Worker: Expiry check finished. Processed: ${res.processed}, Sent: ${res.sent}, Success: ${res.success}`
      );
      if (res.errors.length > 0) {
        console.error(`Cron-Worker run had errors:\n${res.errors.join('\n')}`);
      }
    } catch (err: any) {
      console.error(`Cron-Worker runtime exception: ${err.message || String(err)}`);
    }
  },
};
