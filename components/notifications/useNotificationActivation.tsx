"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { NotificationContentPreview } from "@/components/notifications/NotificationContentPreview";
import {
  notificationPreviewDataFromSearchParams,
  notificationTargetFor,
  type NotificationRouteInput,
  type NotificationPreviewData,
} from "@/lib/notification-target";

export type NotificationActivationItem = NotificationRouteInput;

/**
 * Keeps all in-app notification surfaces consistent: media goes directly to
 * Theater, while text/external content opens a first-party preview surface.
 */
export function useNotificationActivation() {
  const router = useRouter();
  const [preview, setPreview] = useState<NotificationPreviewData | null>(null);

  const activate = useCallback((item: NotificationActivationItem) => {
    const target = notificationTargetFor(item);
    if (target.kind === "preview") {
      const params = new URL(target.href, "https://core.local").searchParams;
      setPreview(notificationPreviewDataFromSearchParams({
        url: params.get("url"),
        title: params.get("title"),
        body: params.get("body"),
        image: params.get("image"),
        avatar: params.get("avatar"),
      }));
      return target;
    }
    router.push(target.href as never, { scroll: target.kind === "theater" ? false : undefined });
    return target;
  }, [router]);

  return {
    activate,
    previewDialog: <NotificationContentPreview preview={preview} onClose={() => setPreview(null)} />,
  };
}
