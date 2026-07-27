import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db';
import { RoomsModule } from './rooms/rooms.module';
import { validateRoomsEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateRoomsEnv }),
    DbModule,
    RoomsModule,
  ],
})
export class AppModule {}
