import { Module } from "@nestjs/common";
import { ConfluenceApiService } from "./confluence-api.service";
import { ConfluenceApiController } from "./confluence.controller";
import { VectorModule } from "../vector/vector.module";

@Module({
  imports: [VectorModule],
  providers: [ConfluenceApiService],
  controllers: [ConfluenceApiController],
})
export class ConfluenceModule {}
