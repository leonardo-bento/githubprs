interface DateFieldProps {
  id: string;
  label: string;
  value: string; // Date string in YYYY-MM-DD format
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  description?: string;
  required?: boolean;
  min?: string; // Minimum date in YYYY-MM-DD format
  max?: string; // Maximum date in YYYY-MM-DD format
}

export default function DateField({
  id,
  label,
  value,
  onChange,
  description,
  required = false,
  min,
  max
}: DateFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required && (
          <span style={{ color: 'var(--destructive)', marginLeft: 'var(--spacing-1)' }}>
            *
          </span>
        )}
      </label>
      <input
        type="date"
        id={id}
        className="input"
        value={value}
        onChange={onChange}
        required={required}
        min={min}
        max={max}
        style={{
          cursor: 'pointer',
          colorScheme: 'dark light' // Allows the date picker to adapt to theme
        }}
      />
      {description && (
        <p style={{ 
          fontSize: '0.75rem', 
          color: 'var(--muted-foreground)', 
          marginTop: 'var(--spacing-1)',
          lineHeight: '1.4'
        }}>
          {description}
        </p>
      )}
    </div>
  );
} 
