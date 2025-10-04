import { Controller, Get } from '@nestjs/common';
import { AppService, AppStatus } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): AppStatus {
    return this.appService.getStatus();
  }
}
