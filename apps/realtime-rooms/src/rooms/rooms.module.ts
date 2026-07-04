import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { MetricsService } from './metrics.service';
import { RoomsController } from './rooms.controller';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import { RoomTokenGuard } from './room-token.guard';
import { StorageService } from './storage.service';
import { TokenService } from './token.service';

@Module({
  controllers: [RoomsController, FilesController],
  providers: [RoomsService, RoomsGateway, TokenService, MetricsService, StorageService, RoomTokenGuard],
  exports: [RoomsService, TokenService],
})
export class RoomsModule {}
