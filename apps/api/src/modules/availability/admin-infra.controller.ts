import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminInfraService } from './admin-infra.service';
import {
  CreateBlockedTimeDto,
  CreateRoomDto,
  SetZoomPolicyDto,
  UpdateRoomDto,
} from './dto/admin-infra.dto';

/** 관리자 인프라(줌·상담실·차단). 관리자 전용. */
@Controller('admin')
@Roles('admin')
export class AdminInfraController {
  constructor(private readonly infra: AdminInfraService) {}

  @Get('zoom-policy')
  getZoom(@CurrentUser() user: AuthUser) {
    return this.infra.getZoomPolicy(user);
  }
  @Put('zoom-policy')
  setZoom(@Body() dto: SetZoomPolicyDto, @CurrentUser() user: AuthUser) {
    return this.infra.setZoomPolicy(dto, user);
  }

  @Get('rooms')
  rooms(@CurrentUser() user: AuthUser) {
    return this.infra.listRooms(user);
  }
  @Get('rooms/availability')
  roomAvailability(@CurrentUser() user: AuthUser) {
    return this.infra.roomAvailability(user);
  }
  @Post('rooms')
  createRoom(@Body() dto: CreateRoomDto, @CurrentUser() user: AuthUser) {
    return this.infra.createRoom(dto, user);
  }
  @Put('rooms/:id')
  updateRoom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.infra.updateRoom(id, dto, user);
  }
  @Delete('rooms/:id')
  deleteRoom(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.infra.deleteRoom(id, user);
  }

  @Get('blocked-times')
  blocked(@CurrentUser() user: AuthUser) {
    return this.infra.listBlocked(user);
  }
  @Post('blocked-times')
  createBlocked(
    @Body() dto: CreateBlockedTimeDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.infra.createBlocked(dto, user);
  }
  @Delete('blocked-times/:id')
  deleteBlocked(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.infra.deleteBlocked(id, user);
  }
}
