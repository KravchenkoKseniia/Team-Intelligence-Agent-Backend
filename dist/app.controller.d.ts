import { AppService, AppStatus } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    getHealth(): AppStatus;
}
