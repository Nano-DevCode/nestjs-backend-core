import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrismaService } from './prisma.service';
import { MongoService, resolveMongoConfig } from './mongo.service';

const mongoConfig = resolveMongoConfig(process.env);

@Global()
@Module({
  imports: [
    ...(mongoConfig.isEnabled && mongoConfig.uri
      ? [
          MongooseModule.forRoot(mongoConfig.uri, {
            dbName: mongoConfig.dbName,
            maxPoolSize: mongoConfig.maxPoolSize,
            minPoolSize: mongoConfig.minPoolSize,
            connectTimeoutMS: mongoConfig.connectTimeoutMS,
            serverSelectionTimeoutMS: mongoConfig.serverSelectionTimeoutMS,
          }),
        ]
      : []),
  ],
  providers: [PrismaService, MongoService],
  exports: [PrismaService, MongoService],
})
export class PrismaModule {}
