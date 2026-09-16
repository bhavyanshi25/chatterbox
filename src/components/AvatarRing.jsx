export default function AvatarRing({ src, alt, online, size = 44 }) {
  return (
    <div
      className={`avatar-ring-wrap ${online ? 'online' : 'offline'}`}
      style={{ width: size + 6, height: size + 6 }}
    >
      <img
        src={src}
        alt={alt}
        className="avatar avatar-ring-img"
        style={{ width: size, height: size }}
      />
      <span
        className={`avatar-status-dot ${online ? 'online' : 'offline'}`}
        title={online ? 'Online' : 'Offline'}
      />
    </div>
  );
}