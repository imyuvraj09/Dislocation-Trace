import { useState } from "react";

/**
 * Derive up to 2 initials from a display name, e.g. "Dr. Ankur Chauhan" -> "AC".
 * Skips short/punctuation-only tokens (titles like "Dr." are just noise here,
 * but we don't special-case them explicitly since falling back to the first
 * two alphabetic tokens already produces a sensible result).
 */
function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const letters = name
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean)
    .map((part) => part[0].toUpperCase());
  if (letters.length === 0) return "?";
  return letters.slice(0, 2).join("");
}

/**
 * Deterministic accent color per member so repeat visits look stable, not
 * random. Drawn from the project's existing beam/zone tokens (tailwind.config.js)
 * rather than default Tailwind colors, to stay consistent with the app's
 * deliberately desaturated palette.
 */
const AVATAR_PALETTE = ["bg-beam-500", "bg-zone-500", "bg-beam-600", "bg-zone-600"];

function paletteIndexFor(seed) {
  const str = String(seed ?? "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_PALETTE.length;
}

export default function MemberCard({ member }) {
  const [expanded, setExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const hasPhoto = Boolean(member.photo) && !imageFailed;
  const accentClass = AVATAR_PALETTE[paletteIndexFor(member.id ?? member.name)];

  return (
    <div
      className="rounded-lg border border-line bg-surface p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-300 ease-in-out"
      onClick={() => setExpanded(!expanded)}
    >
      {hasPhoto ? (
        <img
          src={member.photo}
          alt={member.name}
          className="w-24 h-24 rounded-full mx-auto mb-3 object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div
          className={`w-24 h-24 rounded-full mx-auto mb-3 flex items-center justify-center text-lg font-semibold text-white ${accentClass}`}
          role="img"
          aria-label={member.name}
        >
          {getInitials(member.name)}
        </div>
      )}
      <h3 className="text-lg font-medium text-ink text-center">{member.name}</h3>
      <p className="text-sm text-muted text-center">{member.position}</p>
      
      <p className="text-sm text-muted text-center">
        {member.instituteWebsite ? (
          <a
            href={member.instituteWebsite}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-beam-500 hover:underline transition-colors duration-250 cursor-pointer"
          >
            {member.college}
          </a>
        ) : (
          member.college
        )}
      </p>

      <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[13px]">
        {member.linkedin && (
          <a
            href={member.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-beam-500 hover:underline transition-colors duration-250 cursor-pointer font-medium"
          >
            LinkedIn
          </a>
        )}
        {member.linkedin && member.email && (
          <span className="text-lineStrong">|</span>
        )}
        {member.email && (
          <a
            href={`mailto:${member.email}`}
            onClick={(e) => e.stopPropagation()}
            className="text-beam-500 hover:underline transition-colors duration-250 cursor-pointer font-medium"
          >
            Email
          </a>
        )}
      </div>

      {expanded && (
        <div className="mt-3 text-[14px] leading-relaxed text-muted">
          <p>{member.details}</p>
        </div>
      )}
    </div>
  );
}
