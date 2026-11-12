"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./PosterActionSheet.module.css";

export function PosterActionSheet({ id, title, children, onClose, onRestoreFocus }: {
  id: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          id={id}
          className={styles.sheet}
          data-lenis-prevent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onRestoreFocus();
          }}
        >
          <header className={styles.header}>
            <div className={styles.heading}>
              <Dialog.Title className={styles.title}>More actions</Dialog.Title>
              <Dialog.Description className={styles.description}>{title}</Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close actions">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </header>
          <div className={styles.actions}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
