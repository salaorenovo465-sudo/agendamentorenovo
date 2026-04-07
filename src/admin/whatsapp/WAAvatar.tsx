import { useState } from 'react';
import { AVATAR_COLORS } from './wa-utils';

type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
};

export default function WAAvatar({ name, avatarUrl, size = 40, online }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = name || '?';
  const color = AVATAR_COLORS[fallback.charCodeAt(0) % AVATAR_COLORS.length];
  const showImage = Boolean(avatarUrl) && !imageFailed;

  return (
    <div className="wa2-avatar-wrap" style={{ width: size, height: size }}>
      <div
        className="wa2-avatar"
        style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
      >
        <span className="wa2-avatar-initials">{fallback.slice(0, 2).toUpperCase()}</span>
        {showImage && (
          <img
            src={avatarUrl || ''}
            alt={fallback}
            className="wa2-avatar-img"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
      {online && <div className="wa2-avatar-online" />}
    </div>
  );
}
