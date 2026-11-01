'use client';
import { useEffect, useRef, type ReactNode } from 'react';
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
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="heading">
        <h2>{title}</h2>
        <button type="button" className="quiet" onClick={onClose}>
          닫기
        </button>
      </div>
      {children}
    </dialog>
  );
}
