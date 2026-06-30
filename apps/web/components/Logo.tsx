interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
    >
      <circle cx="32" cy="32" r="32" fill="#C25C2A" />
      <g transform="translate(13,13)">
        <ellipse cx="19" cy="22" rx="12" ry="9" fill="white" opacity="0.9" />
        <ellipse cx="9" cy="15" rx="5.5" ry="4" fill="white" opacity="0.7" transform="rotate(-20 9 15)" />
        <ellipse cx="29" cy="15" rx="5.5" ry="4" fill="white" opacity="0.7" transform="rotate(20 29 15)" />
        <circle cx="15" cy="21" r="2" fill="#C25C2A" />
        <circle cx="23" cy="21" r="2" fill="#C25C2A" />
        <ellipse cx="19" cy="25" rx="2.5" ry="1.5" fill="#C25C2A" opacity="0.5" />
      </g>
    </svg>
  );
}
