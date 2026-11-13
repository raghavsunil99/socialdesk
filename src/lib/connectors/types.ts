/** What a publisher receives: the shared caption plus optional per-network fields from the composer. */
export type PublishPost = {
  text: string; media_url: string | null; media_type: string;
  format?: string | null; title?: string; description?: string; tags?: string[]; media_urls?: string[];
};
