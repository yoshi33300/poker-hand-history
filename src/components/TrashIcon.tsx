interface TrashIconProps {
  className?: string
}

export default function TrashIcon({ className }: TrashIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width="1.1em"
      height="1.1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7H20" />
      <path d="M9 7V4.5C9 4 9.4 3.5 10 3.5H14C14.6 3.5 15 4 15 4.5V7" />
      <path d="M6 7L6.8 19C6.9 19.8 7.5 20.5 8.4 20.5H15.6C16.5 20.5 17.1 19.8 17.2 19L18 7" />
      <path d="M10 11V16.5" />
      <path d="M14 11V16.5" />
    </svg>
  )
}
