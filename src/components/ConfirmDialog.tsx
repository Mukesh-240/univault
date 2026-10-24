"use client";
/**
 * CONFIRM BUTTON — a risky action asks first, in a sentence that says what will happen.
 *
 * Plain-English picture: the button opens a small window: a title, one sentence of consequence ("This link
 * will stop working for everyone. You can create a new one.") and two buttons. The SAFE choice ("Keep
 * sharing") is first and already selected, so pressing Enter by mistake changes nothing. It is a real
 * <dialog>: the keyboard stays inside it, Escape cancels, focus returns to the button.
 * No Undo is offered anywhere it cannot truly be undone: stopping a link cannot be reversed, but a new one can be made.
 */
import { useRef } from "react";

interface Props {
  label: string;
  title: string;
  body: string;
  yes: string;
  no: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  /** CSS classes for the opening button. */
  className?: string;
}

export function ConfirmButton({ label, title, body, yes, no, onConfirm, disabled, className = "secondary bad" }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => dialog.current?.showModal()}>{label}</button>
      <dialog ref={dialog} aria-labelledby="confirm-title" aria-describedby="confirm-body">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" autoFocus onClick={() => dialog.current?.close()}>{no}</button>
          <button type="button" className="danger" onClick={async () => { dialog.current?.close(); await onConfirm(); }}>{yes}</button>
        </div>
      </dialog>
    </>
  );
}
