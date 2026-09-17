import { Module, type DynamicModule } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscordBotController } from './controllers/discord-bot.controller';
import { DiscordGateway } from './gateway/discord.gateway';
import { DiscordBotWsGateway } from './gateway/discord-bot-ws.gateway';
import { LavalinkService } from './audio/lavalink.service';
import { QueueManagerService } from './queue/queue-manager.service';
import { DiscordPlaybackService } from './audio/discord-playback.service';
import { DiscordGuildService } from './persistence/discord-guild.service';
import { CommandRegistryService } from './commands/command-registry.service';
import { PlayCommand } from './commands/play.command';
import { PauseCommand } from './commands/pause.command';
import { ResumeCommand } from './commands/resume.command';
import { SkipCommand } from './commands/skip.command';
import { BackCommand } from './commands/back.command';
import { SeekCommand } from './commands/seek.command';
import { QueueCommand } from './commands/queue.command';
import { RemoveCommand } from './commands/remove.command';
import { ClearCommand } from './commands/clear.command';
import { JoinCommand } from './commands/join.command';
import { LeaveCommand } from './commands/leave.command';
import { StopCommand } from './commands/stop.command';
import { SetChannelCommand } from './commands/setchannel.command';
import { SayCommand } from './commands/say.command';

@Module({})
export class DiscordBotModule {
  static register(): DynamicModule {
    return {
      module: DiscordBotModule,
      imports: [PrismaModule],
      controllers: [DiscordBotController],
      providers: [
        DiscordGuildService,
        QueueManagerService,
        LavalinkService,
        DiscordPlaybackService,
        PlayCommand,
        PauseCommand,
        ResumeCommand,
        SkipCommand,
        BackCommand,
        SeekCommand,
        QueueCommand,
        RemoveCommand,
        ClearCommand,
        JoinCommand,
        LeaveCommand,
        StopCommand,
        SetChannelCommand,
        SayCommand,
        CommandRegistryService,
        DiscordGateway,
        DiscordBotWsGateway,
      ],
      exports: [
        DiscordGuildService,
        QueueManagerService,
        LavalinkService,
        DiscordPlaybackService,
        DiscordGateway,
        DiscordBotWsGateway,
      ],
    };
  }
}
