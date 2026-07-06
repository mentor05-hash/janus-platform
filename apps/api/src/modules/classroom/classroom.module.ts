import { Module } from '@nestjs/common';
import { RoomsBridgeModule } from '../rooms-bridge/rooms-bridge.module';
import { MediaModule } from '../media/media.module';
import { ClassroomController } from './classroom.controller';
import { ClassroomService } from './classroom.service';

// 온라인 강의실. RoomsBridge(판서 룸)·MediaModule(음성 SFU·녹화) 주입.
@Module({
  imports: [RoomsBridgeModule, MediaModule],
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
