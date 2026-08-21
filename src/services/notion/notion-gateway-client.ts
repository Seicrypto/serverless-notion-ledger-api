import type { Env } from "../../types/env";
import type {
  NotionRequestEnvelope,
  NotionResponseEnvelope,
} from "../../types/notion";

export class NotionGatewayClient {
  constructor(private readonly env: Env) {}

  async forward(request: NotionRequestEnvelope): Promise<NotionResponseEnvelope> {
    const stub = this.env.NOTION_GATEWAY.getByName("primary");
    return stub.enqueueRequest(request);
  }
}
