import { Module } from "@nestjs/common";
import { ConfluenceApiService } from "./confluence-api.service";
import { ConfluenceApiController } from "./confluence.controller";
import { VectorModule } from "../vector/vector.module";
import { SupabaseModule } from "../supabase/supabase.module";
import { AtlassianCredentialsService } from "../integrations/atlassian-credentials.service";

@Module({
  imports: [VectorModule, SupabaseModule],
  providers: [ConfluenceApiService, AtlassianCredentialsService],
  controllers: [ConfluenceApiController],
})
export class ConfluenceModule {}
