import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import { TokenService } from './token.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway, TokenService],
  exports: [RoomsService, TokenService],
})
export class RoomsModule {}
