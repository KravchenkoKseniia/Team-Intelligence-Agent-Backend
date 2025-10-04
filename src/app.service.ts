import { Injectable } from '@nestjs/common';

export interface AppStatus {
  service: string;
  status: 'ok';
  timestamp: string;
}

@Injectable()
export class AppService {
  getStatus(): AppStatus {
    return {
      service: 'team-intelligence-agent-backend',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
