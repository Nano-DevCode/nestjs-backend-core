import { Injectable, Logger } from '@nestjs/common';
import { GuildQueue } from './guild-queue.model';

@Injectable()
export class QueueManagerService {
  private readonly logger = new Logger(QueueManagerService.name);
  private readonly queues = new Map<string, GuildQueue>();

  getQueue(guildId: string): GuildQueue | undefined {
    return this.queues.get(guildId);
  }

  getOrCreateQueue(
    guildId: string,
    textChannelId: string,
    voiceChannelId: string,
  ): GuildQueue {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new GuildQueue(guildId, textChannelId, voiceChannelId);
      this.queues.set(guildId, queue);
      this.logger.log(`Nueva cola creada para el servidor [${guildId}]`);
    } else {
      queue.textChannelId = textChannelId;
      queue.voiceChannelId = voiceChannelId;
    }
    return queue;
  }

  deleteQueue(guildId: string): boolean {
    const deleted = this.queues.delete(guildId);
    if (deleted) {
      this.logger.log(`Cola eliminada para el servidor [${guildId}]`);
    }
    return deleted;
  }

  getAllActiveGuildIds(): string[] {
    return Array.from(this.queues.keys());
  }

  getAllQueues(): GuildQueue[] {
    return Array.from(this.queues.values());
  }
}
