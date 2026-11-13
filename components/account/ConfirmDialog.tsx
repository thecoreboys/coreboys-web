"use client";

import { useId, useState, type ReactNode } from "react";
import { Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { AlertTriangle } from "@untitledui/icons";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

/**
 * Accessible confirmation for consequential account actions. Focus is trapped
 * and restored by react-aria; Escape and the backdrop dismiss unless busy.
 * Pass `confirmText` to require typing a word before the action unlocks.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy = false,
  error,
  destructive = true,
  confirmText,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  error?: string | null;
  destructive?: boolean;
  confirmText?: string;
}) {
  const close = (open: boolean) => {
    if (busy) return;
    onOpenChange(open);
  };

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={close}
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      className="fixed inset-0 z-[100] flex min-h-full items-end justify-center overflow-y-auto bg-overlay/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <Modal className="w-full max-w-md rounded-2xl bg-primary text-left shadow-xl ring-1 ring-secondary outline-hidden">
        <ConfirmDialogBody {...{ title, description, confirmLabel, onConfirm, busy, error, destructive, confirmText }} onCancel={() => close(false)} />
      </Modal>
    </ModalOverlay>
  );
}

/** Rendered only while open, so a typed confirmation never survives a close. */
function ConfirmDialogBody({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  error,
  destructive,
  confirmText,
}: {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
  destructive: boolean;
  confirmText?: string;
}) {
  const [typed, setTyped] = useState("");
  const descriptionId = useId();
  const unlocked = !confirmText || typed.trim().toUpperCase() === confirmText.toUpperCase();
  return (
    <Dialog role="alertdialog" aria-describedby={descriptionId} className="p-5 outline-hidden sm:p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (unlocked && !busy) onConfirm();
        }}
      >
        <FeaturedIcon icon={AlertTriangle} size="lg" color={destructive ? "error" : "brand"} theme="light" />
        <Heading slot="title" className="mt-4 text-lg font-semibold text-primary">
          {title}
        </Heading>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-tertiary">
          {description}
        </div>
        {confirmText ? (
          <Input
            className="mt-5"
            size="md"
            label={`Type ${confirmText} to confirm`}
            value={typed}
            onChange={setTyped}
            autoComplete="off"
            autoFocus
            isDisabled={busy}
          />
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg bg-error-primary px-3 py-2 text-sm font-medium text-error-primary ring-1 ring-inset ring-error_subtle" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button color="secondary" size="md" onClick={onCancel} isDisabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            color={destructive ? "primary-destructive" : "primary"}
            size="md"
            isDisabled={!unlocked}
            isLoading={busy}
            showTextWhileLoading
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
