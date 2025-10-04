import { Module } from "@nestjs/common";
import { VectorService } from "./vector.service";

@Module({
  providers: [VectorService],
  exports: [VectorService], // 👈 щоб інші модулі могли його використовувати
})
export class VectorModule {}
