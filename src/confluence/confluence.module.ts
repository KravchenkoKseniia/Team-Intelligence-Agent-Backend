import { Module } from "@nestjs/common";
import { ConfluenceApiService } from "./confluence-api.service";
import { ConfluenceApiController } from "./confluence.controller";
import { VectorModule } from "../vector/vector.module";
import { SupabaseModule } from "../supabase/supabase.module";

@Module({
  imports: [VectorModule, SupabaseModule],
  providers: [ConfluenceApiService],
  controllers: [ConfluenceApiController],
})
export class ConfluenceModule {}
