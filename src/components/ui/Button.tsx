import { cn } from '@/lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline'
  size?: 'xs' | 'sm' | 'md'
}

const VARIANT_CLASSES = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  outline: 'btn-outline'
}

const SIZE_CLASSES = {
  xs: 'btn-xs',
  sm: 'btn-sm',
  md: ''
}

export function Button({
  variant = 'primary',
  size = 'sm',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn('btn', VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
      {...props}
    >
      {children}
    </button>
  )
}
