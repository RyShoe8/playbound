/** Internal document types shared by the party modules. */
import { Types, type Document } from "mongoose";
import { type PartyStatus, type OpenRaModSlug } from "@/lib/playTogether/types";
import { type PartyHostFields } from "@/lib/gameHost/provision";
import { type PartyLanFields } from "@/lib/virtualLan/provision";
import { type PartyCouchFields, type PartyHostMode } from "@/lib/multiplayer/hostModes";
import { type RuleMember } from "@/lib/playTogether/partyRules";

export type PartyDoc = Document & {
  _id: Types.ObjectId;
  gameSlug: string;
  status: PartyStatus;
  members: RuleMember[];
  hostMode?: PartyHostMode | null;
  savedWorldId?: Types.ObjectId | null;
  selfHostReady?: boolean;
  selfHostReadyAt?: Date | null;
  hosted?: PartyHostFields;
  lan?: PartyLanFields;
  couch?: PartyCouchFields & { startedAt?: Date | null };
  publicServer?: PublicServerFields | null;
  openRaMod?: OpenRaModSlug | null;
  maxSize?: number;
  editionSlug?: string | null;
  lastActivity?: Date;
  discord?: { voiceChannelId?: string | null; relocatedAt?: Date | null };
  save: () => Promise<unknown>;
};

export type PublicServerFields = {
  id?: string | null;
  name?: string | null;
  host?: string | null;
  port?: number | null;
  mod?: string | null;
  protected?: boolean;
};
