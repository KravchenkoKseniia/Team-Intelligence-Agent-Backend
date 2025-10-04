export interface AppStatus {
    service: string;
    status: 'ok';
    timestamp: string;
}
export declare class AppService {
    getStatus(): AppStatus;
}
