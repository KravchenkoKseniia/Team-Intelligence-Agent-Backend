import { BadGatewayException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { normalizeEnv } from "../utils/env-loader";

export interface VectorDocument {
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class VectorService {
  private config?: {
    openAiKey: string;
    openAiModel: string;
    pineconeApiKey: string;
    pineconeBaseUrl: string;
    defaultNamespace: string;
    batchSize: number;
  };

  private ensureConfig() {
    if (this.config) return this.config;
    const openAiKey = normalizeEnv(process.env.OPENAI_API_KEY);
    const pineconeApiKey = normalizeEnv(process.env.PINECONE_API_KEY);
    const pineconeBaseUrl = normalizeEnv(process.env.PINECONE_BASE_URL);
    if (!openAiKey)
      throw new BadGatewayException("OPENAI_API_KEY is not configured");
    if (!pineconeApiKey)
      throw new BadGatewayException("PINECONE_API_KEY is not configured");
    if (!pineconeBaseUrl)
      throw new BadGatewayException("PINECONE_BASE_URL is not configured");

    this.config = {
      openAiKey,
      openAiModel:
        normalizeEnv(process.env.OPENAI_EMBEDDING_MODEL) ??
        "text-embedding-3-small",
      pineconeApiKey,
      pineconeBaseUrl: pineconeApiKey
        ? pineconeBaseUrl.replace(/\/$/, "")
        : pineconeBaseUrl,
      defaultNamespace: normalizeEnv(process.env.PINECONE_NAMESPACE) ?? "test",
      batchSize: Number(normalizeEnv(process.env.VECTOR_BATCH_SIZE)) || 20,
    };
    return this.config;
  }

  async embedAndUpsert(
    documents: VectorDocument[],
    options: { namespace?: string } = { namespace: undefined }
  ) {
    if (!documents.length)
      return {
        namespace: options.namespace ?? this.ensureConfig().defaultNamespace,
        vectorCount: 0,
      };
    const cfg = this.ensureConfig();
    const namespace =
      (options.namespace ?? cfg.defaultNamespace).trim() ||
      cfg.defaultNamespace;

    // Простий chunking і sync виклики (для початку). Можна покращити concurrency / retry
    const chunkSize = cfg.batchSize;
    let processed = 0;

    for (let i = 0; i < documents.length; i += chunkSize) {
      const chunk = documents
        .slice(i, i + chunkSize)
        .map((d) => this.sanitizeDocument(d));
      const embeddings = await this.fetchEmbeddings(chunk, cfg);
      await this.upsertVectors(chunk, embeddings, namespace, cfg);
      processed += embeddings.length;
    }

    return { namespace, vectorCount: processed };
  }

  private sanitizeDocument(doc: VectorDocument) {
    const text = (doc.text ?? "").toString().trim();
    return {
      id: (doc.id && doc.id.toString()) || randomUUID(),
      text: text.length > 8000 ? text.slice(0, 8000) : text,
      metadata: doc.metadata,
    };
  }

  private async fetchEmbeddings(documents: VectorDocument[], cfg: any) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.openAiKey}`,
      },
      body: JSON.stringify({
        model: cfg.openAiModel,
        input: documents.map((d) => d.text),
      }),
    });
    if (!res.ok) {
      const payload = await this.safeJson(res);
      throw new BadGatewayException(
        `OpenAI error: ${payload?.error?.message ?? res.statusText}`
      );
    }
    const data = await res.json();
    return (data.data ?? []).map((it: any) =>
      it.embedding.map((v: any) => Number(v))
    );
  }

  private async upsertVectors(
    documents: VectorDocument[],
    embeddings: number[][],
    namespace: string,
    cfg: any
  ) {
    const url = `${cfg.pineconeBaseUrl}/vectors/upsert`;
    const vectors = documents.map((d, i) => ({
      id: d.id,
      values: embeddings[i],
      metadata: d.metadata,
    }));
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": cfg.pineconeApiKey,
      },
      body: JSON.stringify({ vectors, namespace }),
    });
    if (!res.ok) {
      const p = await this.safeJson(res);
      throw new BadGatewayException(
        `Pinecone upsert failed: ${p?.message ?? res.statusText}`
      );
    }
  }

  private async safeJson(res: Response) {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
}
