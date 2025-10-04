import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new InternalServerErrorException(
        "Supabase credentials not found in environment"
      );
    }

    this.client = createClient(url, key);
  }

  getClient() {
    return this.client;
  }
}
