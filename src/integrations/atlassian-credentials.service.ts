import { Injectable, BadGatewayException } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";

export interface AtlassianCredentials {
  baseUrl: string;
  email: string;
  apiKey: string;
}

@Injectable()
export class AtlassianCredentialsService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Отримує Atlassian креденшали (Jira/Confluence) з таблиці integrations.
   * Можна фільтрувати по type або organization_id.
   */
  async getCredentials(
    type: "atlassian" | "confluence" | "atlassian" = "atlassian"
  ): Promise<AtlassianCredentials> {
    const client = this.supabase.getClient();

    const { data, error } = await client
      .from("integrations")
      .select("*")
      .eq("type", type)
      .eq("status", "connected")
      .limit(1)
      .single();

    if (error || !data) {
      console.error("[AtlassianCreds] ❌ Failed to load credentials:", error);
      throw new BadGatewayException(
        "Atlassian credentials not found in Supabase"
      );
    }

    const { api_email, api_token, config } = data;
    let url =
      (config?.url as string) ??
      data.oauth_authorize_url ??
      "https://example.atlassian.net";

    // додаємо https:// якщо забули
    if (!url.startsWith("http")) url = `https://${url}`;
    url = url.replace(/\/$/, "");

    if (!api_email || !api_token) {
      throw new BadGatewayException("Atlassian credentials are incomplete");
    }

    console.log(`[AtlassianCreds] 🔑 Loaded ${type} credentials from Supabase`);

    return {
      baseUrl: url,
      email: api_email,
      apiKey: api_token,
    };
  }
}
