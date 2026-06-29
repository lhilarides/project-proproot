import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PwaBadge() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 9999, background: '#1e293b', color: 'white', padding: 16, borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '0.9rem' }}>
        {offlineReady ? 
          <span>App ready to work offline!</span> : 
          <span>New content available, click reload to update.</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {needRefresh && <button onClick={() => updateServiceWorker(true)} style={{ padding: '6px 12px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Reload</button>}
        <button onClick={close} style={{ padding: '6px 12px', background: 'transparent', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}
