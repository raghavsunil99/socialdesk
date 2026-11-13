import "server-only";
import type { Account } from "../metrics";
import { publishInstagram, syncInstagram } from "./instagram";
import { publishFacebook, syncFacebook } from "./facebook";
import { identifyYouTube, publishYouTube, syncYouTube } from "./youtube";
import { identifyLinkedIn, publishLinkedIn, syncLinkedIn } from "./linkedin";
import { identifyX, publishX, syncX } from "./x";

import type { PublishPost as Post } from "./types";

export const SYNC: Record<string, (acc: Account) => Promise<{ warnings: string[] }>> = {
  instagram: syncInstagram,
  facebook: syncFacebook,
  youtube: syncYouTube,
  linkedin: syncLinkedIn,
  x: syncX,
};

export const PUBLISH: Record<string, (acc: Account, post: Post) => Promise<string>> = {
  instagram: publishInstagram,
  facebook: publishFacebook,
  youtube: publishYouTube,
  linkedin: publishLinkedIn,
  x: publishX,
};

export const IDENTIFY: Record<string, (token: string) => Promise<{ externalId: string; handle: string }>> = {
  youtube: identifyYouTube,
  linkedin: identifyLinkedIn,
  x: identifyX,
};
