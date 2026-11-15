'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
export function Dialog({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="quiet" onClick={onClose}>
          닫기
        </button>
      </div>
      {children}
    </dialog>
  );
}
