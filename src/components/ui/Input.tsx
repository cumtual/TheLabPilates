import { type InputHTMLAttributes } from 'react'

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Input label displayed above the field */
  label?: string
  /** Error message displayed below the field */
  error?: string
  /** Additional CSS classes */
  className?: string
}

export function Input({
  id,
  label,
  name,
  type = 'text',
  placeholder,
  error,
  required,
  disabled,
  className = '',
  ...props
}: InputProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="font-body text-body-md font-semibold text-on-surface"
        >
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          'w-full px-4 py-3 min-h-11',
          'font-body text-body-md text-on-surface',
          'bg-surface border border-outline-variant rounded-DEFAULT',
          'placeholder:text-outline',
          'transition-colors duration-200',
          'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-container-low',
          error ? 'border-error! focus:ring-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      />
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="font-body text-[13px] text-error"
        >
          {error}
        </p>
      )}
    </div>
  )
}
