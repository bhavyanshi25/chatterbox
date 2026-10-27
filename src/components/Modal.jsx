import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useClickOutside } from '../hooks/useClickOutside';

export default function Modal({ title, onClose, children, footer }) {
  const panelRef = useRef(null);
  useClickOutside(panelRef, onClose);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop fade-in">
      <div className="modal-panel pop-in" ref={panelRef} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="navbar-icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
