import { useHud } from '../store';

const COLORS = { info: '#5a4730', warn: '#a03030', good: '#2fa04f' } as const;

/** stack of transient notifications, top-center */
export function Toasts() {
  const toasts = useHud((s) => s.toasts);
  return (
    <div style={{ position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 4, zIndex: 30, pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          style={{
            background: '#241b10',
            border: `1px solid ${COLORS[t.kind]}`,
            borderRadius: 3,
            color: '#e8dcc0',
            padding: '6px 14px',
            fontSize: 13,
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
