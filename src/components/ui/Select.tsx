import { type SelectHTMLAttributes } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Select label displayed above the field */
  label?: string
  /** Array of options to display */
  options: SelectOption[]
  /** Placeholder text for the default empty option */
  placeholder?: string
  /** Error message displayed below the field */
  error?: string
  /** Additional CSS classes */
  className?: string
}

export function Select({
  id,
  label,
  name,
  options,
  placeholder,
  error,
  required,
  disabled,
  className = '',
  ...props
}: SelectProps) {
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
      <select
        id={id}
        name={name}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          'w-full px-4 py-3 min-h-11',
          'font-body text-body-md text-on-surface',
          'bg-surface border border-outline-variant rounded-DEFAULT',
          'transition-colors duration-200',
          'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-surface-container-low',
          'appearance-none bg-no-repeat bg-position-[right_12px_center]',
          'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%2716%27%20height%3D%2716%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%237e766d%27%20stroke-width%3D%272%27%3E%3Cpath%20d%3D%27M6%209l6%206%206-6%27/%3E%3C/svg%3E")]',
          error ? 'border-error! focus:ring-error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
