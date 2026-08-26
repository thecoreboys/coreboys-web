import { z } from "zod";
import {
  PostcardAcknowledgementSchema,
  PostcardPackConfigSchema,
  PostcardPackCreateSchema,
} from "./postcard-pack-schema";

const Id = z.string().uuid();
const UnsafeText = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const PlainNote = z.string().trim().max(2000)
  .refine((value) => !UnsafeText.test(value), "Markup and control characters are not allowed.");
const OrderId = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/);

const CreatePackAction = PostcardPackCreateSchema.omit({ memberSlug: true }).extend({
  action: z.literal("create_pack"),
  config: PostcardPackConfigSchema,
}).strict();

const UpdatePackAction = PostcardPackCreateSchema.omit({ memberSlug: true, slug: true }).extend({
  action: z.literal("update_pack"),
  packId: Id,
}).strict();

const RetirePackAction = z.object({
  action: z.literal("retire_pack"),
  packId: Id,
}).strict();

const SaveRevisionAction = z.object({
  action: z.literal("save_revision"),
  packId: Id,
  config: PostcardPackConfigSchema,
}).strict();

const SubmitRevisionAction = z.object({
  action: z.literal("submit_revision"),
  revisionId: Id,
}).strict();

const ReviewRevisionAction = z.object({
  action: z.literal("review_revision"),
  revisionId: Id,
  decision: z.enum(["approved", "rejected"]),
  note: PlainNote.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.decision === "rejected" && !value.note?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "A review note is required when requesting changes.",
    });
  }
});

const PublishRevisionAction = z.object({
  action: z.literal("publish_revision"),
  revisionId: Id,
}).strict();

const ScheduleDropAction = z.object({
  action: z.literal("schedule_drop"),
  packId: Id,
  revisionId: Id,
  code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: z.string().trim().min(1).max(120)
    .refine((value) => !UnsafeText.test(value), "Markup and control characters are not allowed."),
  description: z.string().trim().max(1000)
    .refine((value) => !UnsafeText.test(value), "Markup and control characters are not allowed.")
    .nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  albumCode: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "Drop end time must be after its start time.",
    });
  }
});

const CancelDropAction = z.object({
  action: z.literal("cancel_drop"),
  dropId: Id,
}).strict();

const AcknowledgeAction = PostcardAcknowledgementSchema.extend({
  action: z.literal("acknowledge"),
  orderId: OrderId,
}).strict();

export const PostcardStudioActionSchema = z.union([
  CreatePackAction,
  UpdatePackAction,
  RetirePackAction,
  SaveRevisionAction,
  SubmitRevisionAction,
  ReviewRevisionAction,
  PublishRevisionAction,
  ScheduleDropAction,
  CancelDropAction,
  AcknowledgeAction,
]);

export type PostcardStudioAction = z.infer<typeof PostcardStudioActionSchema>;

export type PostcardStudioRevision = {
  id: string;
  version: number;
  state: "draft" | "submitted" | "approved" | "rejected" | "published" | "superseded";
  config: z.infer<typeof PostcardPackConfigSchema>;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type PostcardStudioPack = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  state: "draft" | "active" | "retired";
  publishedRevisionId: string | null;
  latestRevision: PostcardStudioRevision | null;
  updatedAt: string;
};

export type PostcardStudioDrop = {
  id: string;
  packId: string;
  revisionId: string;
  packTitle: string;
  revisionVersion: number;
  code: string;
  title: string;
  description: string | null;
  state: "draft" | "scheduled" | "cancelled" | "ended";
  startsAt: string;
  endsAt: string | null;
};

export type PostcardStudioInboxItem = {
  id: string;
  message: string;
  senderName: string | null;
  designId: string | null;
  status: string;
  hasCustomArt: boolean;
  createdAt: string;
  acknowledgement: {
    reaction: "seen" | "heart" | "thank_you";
    visibleToSender: boolean;
    updatedAt: string;
  } | null;
};

export type PostcardStudioDashboard = {
  packs: PostcardStudioPack[];
  drops: PostcardStudioDrop[];
  inbox: PostcardStudioInboxItem[];
  analytics: {
    ordersStarted: number;
    ordersPaid: number;
    ordersAccepted: number;
    ordersRefunded: number;
    ordersAcknowledged: number;
  };
};

export function defaultPostcardPackConfig(title: string): z.infer<typeof PostcardPackConfigSchema> {
  return {
    schemaVersion: 1,
    title: title.trim() || "New postcard pack",
    description: "",
    palettes: [{
      id: "core-night",
      label: "CORE Night",
      background: "#09090B",
      surface: "#18181B",
      ink: "#FFFFFF",
      mutedInk: "#A1A1AA",
      primary: "#EC006E",
      secondary: "#7C3AED",
      highlight: "#FDE047",
    }],
    motifs: [],
    prompts: [],
    phrases: [],
    designs: [{
      id: "hero-card",
      label: "Hero card",
      description: "A clean creator card with one photo and an editable headline.",
      composition: "holographic-mvp",
      photoSlots: 1,
      fields: [{ key: "headline", label: "Headline", kind: "text", required: true, maxLength: 80 }],
      paletteIds: ["core-night"],
      motifIds: [],
      assetIds: [],
      backgroundStyle: "radial",
      gradientDirection: 45,
      edgeTreatments: ["rounded"],
      frameStyles: ["collector"],
      attachmentStyles: ["none"],
    }],
  };
}
